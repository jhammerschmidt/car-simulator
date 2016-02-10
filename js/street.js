var isNode = typeof window == 'undefined'; // || this != window;

var Bezier = require('./lib/bezier.js');
var async = require("./lib/async.js");
if (isNode) {
	jsonfile = module.require('jsonfile');
	THREE = module.require('three');
}

function load_json(file, callback) {
	if (isNode) {
		//jsonfile
		var json = module.require('../'+file);
		callback(json);
	} else {
		$.getJSON(file, callback);
	}
}

var Street = function(no_load_texture, lut_points_per_meter, street_width, segment_points_per_meter)
{
	this.loaded = false;
	this.street_width = street_width || 20;
	this.lut_points_per_meter = lut_points_per_meter || 0.1;
	this.segment_points_per_meter = segment_points_per_meter || 0.1;
	this.segments = [];
	this._dists = [];


	if (!no_load_texture && Street.road_tex === undefined) {
	    var road_tex = new THREE.TextureLoader().load('textures/road.jpg');
	    road_tex.anisotropy = renderer.getMaxAnisotropy();
	    road_tex.wrapT = THREE.RepeatWrapping;
	    road_tex.repeat.set(1, 5);
		Street.road_tex = road_tex;
	}
}

function find_two_smallest_values(array) {
	console.assert(array.length >= 2);
	var first = Number.MAX_VALUE;
	var second = Number.MAX_VALUE;
	var ifirst = 0, isecond = 0;
	for (var i = 0, len = array.length; i < len; i++) {
	    var d = array[i];
	    if (d < first) {
	        second = first; isecond = ifirst;
	        first = d; ifirst = i;
	    } else if (d < second) {
	    	second = d; isecond = i;
	    }
	}
	return [ifirst,isecond,first,second];
}

function distSq2d(p1,p2) {
    var dx = p2.x - p1.x,
        dy = p2.y - p1.y;
    return dx * dx + dy * dy;
}

Street.vec3toxy = function(vec3) { return {x:vec3.x, y:vec3.z}; }
Street.xytovec3 = function(v) { return new THREE.Vector3(v.x,0.1,v.y);}

Street.prototype = {

	// street_segment: function(lut) {
	// 	this.lut = lut
	// }

	find_two_nearest_points: function(segment, xy) {
		lut = segment.lut; dists = this._dists; dists.length = lut.length;
		for (var i = 0, len = lut.length; i < len; i++) {
			dists[i] = distSq2d(lut[i], xy);
		}
		return find_two_smallest_values(dists)
	},

	get_road_position: function(vec3, stats) {
		var dists = this._dists, segments = this.segments;
		// var v = new THREE.Vector2(x,y);
		dists.length = segments.length; //Math.max(segments.length, this.lut_points);
		for (var i = 0, len = segments.length; i < len; i++) {
			dists[i] = segments[i].geometry.boundingSphere.center.distanceToSquared(vec3);
		}
		var nearest = find_two_smallest_values(dists);
		//var d2 = dists[nearest[1]]
		var xy = Street.vec3toxy(vec3);
		var p0 = this.find_two_nearest_points(segments[nearest[0]], xy);
		var p1 = this.find_two_nearest_points(segments[nearest[1]], xy);
		// if (d2 <= Math.pow(segments[nearest[1]].geometry.boundingSphere.radius, 2))
		// 	console.log(p0,p1);
		var p = p0, segment = segments[nearest[0]];
		if (p0[3] > p1[3]) { // select segment where the *second*-nearest point is nearest (the nearest points might be identical!)
			p = p1; segment = segments[nearest[1]];
		}
		// proect onto line
		var i0 = Math.min(p[0],p[1]),
			i1 = Math.max(p[0],p[1]);
		var l = new THREE.Vector2().copy(segment.lut[i1]).sub(segment.lut[i0]);
		var ll = l.length(); l.divideScalar(ll);
		var tsub = l.dot(new THREE.Vector2().copy(xy).sub(segment.lut[i0])) / ll;
		const lut_points = segment.lut_points;
		stats.add('i0', i0);
		stats.add('tsub', tsub);
		stats.add('p_i0', i0/lut_points * segment.road_length);
		stats.add('p_i1', i1/lut_points * segment.road_length);
		var tseg = (i0+tsub)/lut_points;
		return segment.accumulated_road_length + tseg*segment.road_length
		// return {'pos': segment.accumulated_road_length + tseg*segment.road_length, 't': + tseg};
		debugger;
		var d = p[3] / (p[2] + p[3]); // interpolation factor // TODO: only valid if projected onto (middle) bezier curve!
		return segment.accumulated_road_length + (d*p[0] + (1-d)*p[1]) / lut_points * segment.road_length;
	},

    create_street_geometry: function(segments, pathfunc) {
        var polygon = Array((segments+1)*2);
        var geo = new THREE.PlaneGeometry(3, segments, 1, segments); //width, height, widthSegments, heightSegments
        for (var i = 0; i <= segments; i++) {
            var p = pathfunc(i / segments);
            geo.vertices[i * 2].set(p[0].x, 0.1, p[0].y);
            geo.vertices[i * 2 + 1].set(p[1].x, 0.1, p[1].y);
            polygon[i] = [p[0].x,p[0].y];
            polygon[polygon.length-i-1] = [p[1].x,p[1].y];
        }
        //street_polygons.push(polygon);
        return {geo:geo, poly:polygon};
    },

    add_street_segment: function(curve) {

        var street_width = this.street_width;
        const segment_points = Math.round(this.segment_points_per_meter * curve.length());

        var geo = this.create_street_geometry(segment_points, function(t) {
            return [curve.offset(t, 0.5*street_width), curve.offset(t, -0.5*street_width)];
        });

        var street = {}; 
        street.segment_points = segment_points;
        street.geometry = geo.geo;
        street.poly = geo.poly;
        street.lut_points = Math.round(this.lut_points_per_meter * curve.length());
        street.lut = curve.getLUT(street.lut_points);
        street.road_length = curve.length();
        street.curve = curve;

        //this.segments.push(street);

        //scene.add(street);
        return street;
    },

    create_road: function(callback) {
    	var that = this;
    	async.series([
    		function(next) {
		    	if (false) {
			        function rand(min, max) {
			            return Math.random() * (max - min) + min
			        }
			        var origin = new THREE.Vector2(0, 0);
			        var p = new THREE.Vector2(0, 0); // current point
			        var t = new THREE.Vector2(0, 1); // current tangent
			        for (var i = 0; i < 3; i++) {
			        	var dev = 0;
			            var p_deviation = rand(-dev * Math.PI, dev * Math.PI); // deviation from current tangent (0.25)
			            var distance = rand(80, 100); //distance from current point
			            var a2_deviation = rand(-dev * Math.PI, dev * Math.PI); // deviation of second (remote) bezier point from straight line
			            var a1_length = rand(10, 0.5 * distance),
			                a2_length = (10, 0.5 * distance); // distances of bezier points from main points
			            var p2 = p.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation), distance);
			            var segment = new Bezier(
			                p,
			                p.clone().addScaledVector(t, a1_length),
			                p2.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation + Math.PI + a2_deviation), a2_length),
			                p2);
			            t.copy(segment.derivative(1)).normalize();
			            p.copy(p2);
			            this.segments.push(segment);
			            next();
			            //this.add_street_segment(segment);
				   //      var segments = that.segments;
				   //      segments[0].accumulated_road_length = 0;
				   //      for (var i = 1; i < segments.length; i++) {
							// segments[i].accumulated_road_length = segments[i-1].accumulated_road_length + segments[i-1].road_length;
				   //      }
				   //      var segment_points = that.segment_points;
			        }
			    } else {
					load_json('track.study1.json', function(track) {
					    var cfg = {ver2: false, deviation_mult: 2, distance_mult: 0.1, scale: 1000.0}; 
					    var scale = cfg.scale;
		                var origin = new THREE.Vector2(0, 0);
		                var p = new THREE.Vector2(0,0);
		                var t = new THREE.Vector2(0, 1); // tangent
		                var first = true, prev = null;
		                var cur_percent = 0;
		                var signs = track.signs;
			          function do_bezier(p_deviation, distance) {
			            var a2_deviation = p_deviation;
			            var a1_length = 0.4 * distance,
			                a2_length = 0.4 * distance;
			            var p2 = p.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation), distance);
			            var segment = new Bezier(
			                p,
			                p.clone().addScaledVector(t, a1_length),
			                p2.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation + Math.PI + a2_deviation), a2_length),
			                p2);
			            that.segments.push(segment);
			            //that.add_street_segment(segment);
			            t.copy(segment.derivative(1)).normalize();
			            p.copy(p2);
			            return segment.length();
			          }
			          function proc_sign(sign) {
			            var p_deviation = (sign.type == 13 ? -0.2 : 0.2) * sign.intensity * sign.duration * cfg.deviation_mult;
			            var distance = (sign.duration) * scale * cfg.distance_mult;
			            return do_bezier(p_deviation, distance) / scale;
			          }
			          function proc_prev_sign(prev,cur_percent) {
			            var p_deviation = (prev.type == 13 ? -0.2 : 0.2) * Math.PI;
			            var distance = (cur_percent - prev.percent) * scale;
			            do_bezier(p_deviation, distance);
			          };
			          for (var i = 0; i < signs.length; i++) {
			            var sign = signs[i];
			            if (sign.type >= 13) {
			              if (cfg.ver2) {
			                var p0 = p.clone();
			                var percent1 = (sign.percent - cur_percent);
			                if (percent1 > 0) {
			                  do_bezier(0,percent1 * scale);
			                }
			                cur_percent += Math.max(percent1,0) + proc_sign(sign);
			              } else {
			                if (first) {
			                  do_bezier(0, sign.percent * scale);
			                  first = false;
			                } else {
			                  proc_prev_sign(prev,sign.percent);
			                }
			                prev = sign;
			              }
			            }
			          }
			          if (cfg.ver2) {
			            if (cur_percent < 1) {
			            	do_bezier(0, (1-cur_percent) * scale);
			            }
			          } else
			            proc_prev_sign(prev,1);
			          next();

			   //      var segments = that.segments;
				  //       segments[0].accumulated_road_length = 0;
			   //      for (var i = 1; i < segments.length; i++) {
						// segments[i].accumulated_road_length = segments[i-1].accumulated_road_length + segments[i-1].road_length;
			   //      }
			   //      var segment_points = that.segment_points;

					}); // getJSON
			    }
			}, function(next) {
				that.segments = that.segments.map(function(v){return that.add_street_segment(v);});
				that.poly_bezier = new Bezier.PolyBezier(that.segments.map(function(v){return v.curve}));
				that.poly_bezier.cacheLengths();
				that.segments[0].accumulated_road_length = 0;
				for (var i = 1; i < that.segments.length; i++)
					that.segments[i].accumulated_road_length = that.poly_bezier.acc_lengths[i-1];
				next();
    		}, function(next) {
		        load_json('track.study1.json', function(track) {
		        	var segments = that.segments;
		            var ps = track.points; //$.extend(true, [], track.points);
		            for (var i = 0; i < ps.length; i++) {
		                //ps[i].x *= cfg.scale_x;
		                ps[i].y = (ps[i].y - 82) * 0.3; // <-- y scale <-- 
		            }
		            var tpb = new Bezier.PolyBezier(); // track height profile's poly bezier
		            for (var i = 0; i < ps.length - 2; i += 3) {
		                tpb.addCurve( new Bezier(ps[i], ps[i + 1], ps[i + 2], ps[i + 3]) );
		            }
		            tpb.cacheLengths();

					var pb = that.poly_bezier;
			        var t0 = 0;
			        segments.forEach(function(s,i) {
			        	var pi = pb.parts[i];
			        	var vertices = s.geometry.vertices;
			        	var segment_points = s.segment_points;
			        	for (var j = 0; j <= segment_points; j++) {
			        		var t = t0 + j/segment_points * pi;
			        		var y = tpb.get(t).y
			        		vertices[j*2].y = vertices[j*2+1].y = y;
			        	}
			        	var lut_points = s.lut_points;
			        	s.lut.forEach(function(l,i) {
			        		var t = i/lut_points;
			        		l.height = tpb.get(t0 + i/lut_points*pi).y; // TODO: do we really need that?
			        		l.normal = s.curve.normal(t);
			        	});
			        	s.geometry.verticesNeedUpdate = true;
			        	t0 = pb.bounds[i];
			        });
			        that.height_profile = tpb;
			        next();
			    });
			}, function(next) {
				if (!isNode) {
					that.street_mesh = new THREE.Object3D();
					that.segments.forEach(function(v){
					    var mat = new THREE.MeshBasicMaterial({
					            map: Street.road_tex,
					            color: 0x5EFF00, //0x5d5d88,
					            side:THREE.DoubleSide
					        });						
						v.geometry.computeBoundingSphere();
						v.geometry.boundingSphere.radius *= 1.1;
						v.mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(v.geometry), mat); 
						//v.material = v.mesh.material;
						// v.mesh = new THREE.Mesh(v.geometry, mat);
						that.street_mesh.add(v.mesh);

						if (true) {
							const sphere = new THREE.SphereGeometry(0.3);
							const material = new THREE.MeshBasicMaterial( {color: 0xffff00} );
							v.lut.forEach(function(l) {
								var mesh = new THREE.Mesh(sphere, material);
								mesh.position.set(l.x,l.height,l.y);
								that.street_mesh.add(mesh);							
							})
						}
					});
					scene.add(that.street_mesh);
				}
				that.loaded = true;
				next();
			}
    	], callback);
    } // create_road
};

if (typeof module !== 'undefined' && module.exports) {
	module.exports = Street;
} else {
	this.Street = Street;
}