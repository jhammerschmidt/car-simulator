require("../node_modules/three/examples/js/controls/TrackballControls.js");
require("../node_modules/three/examples/js/loaders/MTLLoader.js");
//require("../../node_modules/three/examples/js/loaders/OBJMTLLoader.js");
require("../node_modules/three/examples/js/loaders/OBJLoader.js");
// let dat = require('../../bower_components/dat-gui/build/dat.gui.js');
const load_car = require("./load_car.js");
const misc = require('./misc.js');

let camera = THREE.get_camera();
camera.position.z = 30;
var controls = new THREE.TrackballControls(camera, renderer.domElement);

THREE.addDefaultLight(true);

function add_light(obj, name, x,y,z, intensity, light_factory) {
	intensity = intensity || 1.0
	light_factory = light_factory || ((c,i) => new THREE.PointLight(c,i));
	var light = light_factory(0xffffff, intensity);
	light.position.set(x,y,z);
	var lf = gui.addFolder(name);
	lf.addxyz(light.position, 0.1, () => render());
	lf.addnum(light, 'intensity').onChange(() => render());
	// lf.addnum(light, 'distance', 1);
	// lf.addnum(light, 'decay');
	obj.add(light);
	
	const plh = new THREE.PointLightHelper(light, 0.05);
	scene.add(plh);
}

var gui = new dat.GUI();

dat.GUI.prototype.addnum = function(object, prop, prec) {
    var prev = object[prop];
    object[prop] = prec || 0.1;
    const r = this.add(object, prop);
    object[prop] = prev;
    this.__controllers[this.__controllers.length - 1].updateDisplay();
    return r;
}

dat.GUI.prototype.addxyz = function(object, prec, callback) {
    this.addnum(object, 'x', prec).onChange(callback);
    this.addnum(object, 'y', prec).onChange(callback);
    this.addnum(object, 'z', prec).onChange(callback);
}

if (false) { // eslint-disable-line
	load_car.load_car(function(car) {
		scene.add(car);
	});
} else if (false) { // eslint-disable-line
	let loader = new THREE.OBJLoader();
	loader.load(
		'models/volvo.obj',
		function ( obj ) {
			scene.add( obj );
		}
	);
} else if (true) { //eslint-disable-line+
	misc.load_obj_mtl_url('models/', 'test.obj', 'test.mtl').then(obj => {
	// misc.load_obj_mtl_url('models/speed_sign/', 'speed_sign.obj', 'speed_sign.mtl').then(obj => {
	//misc.load_obj_mtl_url('models/stop_sign/', 'stop_sign.obj', 'stop_sign.mtl').then(obj => {
		scene.add(obj);
		let mats = [], bmats = [];
		for (let c of obj.children) {
			const mat = c.material;
			if (mat instanceof THREE.MultiMaterial)
				mats = mats.concat(mat.materials);
			else
				mats = mats.concat(mat);
		}
		for (let m of mats) {
			if (m.bumpMap) {
				m.bumpScale2 = m.bumpScale;
				bmats = bmats.concat(m);
			}
			m.shininess2 = m.shininess;
			m.color2 = m.color.clone();
			m.specular2 = m.specular.clone();
			m.side = THREE.DoubleSide;
		}
		const scales = {'bump_scale': 0.1, 'shininess_scale': 1.0, 'diffuse_scale': 1.0, 'specular_scale': 1.0};
		const set_bscale = s => {
			for (let m of bmats) {
				m.bumpScale = s * m.bumpScale2;
			}
			render();
		}		
		gui.addnum(scales, 'bump_scale').onChange(set_bscale);
		set_bscale(scales.bump_scale);

		const set_sscale = s => {
			for (let m of mats) {
				m.shininess = s * m.shininess2;
			}
			render();
		}
		gui.addnum(scales, 'shininess_scale').onChange(set_sscale);

		const set_diff_scale = s => {
			for (let m of mats) {
				const hsl = m.color2.getHSL();
				m.color.setHSL(hsl.h, hsl.s, hsl.l * s); 
			}
			render();			
		}
		gui.addnum(scales, 'diffuse_scale').onChange(set_diff_scale);

		const set_spec_scale = s => {
			for (let m of mats) {
				const hsl = m.specular2.getHSL();
				m.specular.setHSL(hsl.h, hsl.s, hsl.l * s); 
			}
			render();			
		}
		gui.addnum(scales, 'specular_scale').onChange(set_spec_scale);
		scene.dump_camera = () => {
			// console.log(JSON.stringify(camera.matrix.toArray()));
			console.log(JSON.stringify({'target':controls.target, 'position':controls.object.position}));
		}
		gui.add(scene, 'dump_camera');
		let cam_state = '{"target":{"x":0.4653574635316403,"y":1.3639501225698958,"z":0.6915165387908757},"position":{"x":0.43844443752257944,"y":1.897284746757053,"z":-0.5325149172915407}}';
		cam_state = JSON.parse(cam_state);
		controls.target.copy(cam_state.target);
		controls.object.position.copy(cam_state.position);

		scene.mname = 'name';
		gui.add(scene, 'mname');

		add_light(scene, 'light_inside', 0.52,1.69,-0.29, 0.65);
		add_light(scene, 'light_left', 1.78,1.88,-0.08, 0.56);
		add_light(scene, 'light_right', -2.01,2.23,-0.68, 0.56);
		add_light(scene, 'hemi_light', 0, 8, -8, 0.7, (c,i) => new THREE.HemisphereLight(0xfffff0, 0x101020, i));

		// const cam_matrix = [-0.7559852600097656,0.029572896659374237,-0.6539202928543091,0,-0.10186368972063065,0.9814943671226501,0.1621498465538025,0,0.6466143131256104,0.18919363617897034,-0.7389828562736511,0,2.312574863433838,1.8540887832641602,-1.2792788743972778,1];
		// camera.matrix.fromArray(JSON.parse(cam_matrix));
		// camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
		// gui.addnum(
		// 	obj.children.filter(c => c.name.indexOf('SEATS_driver') >= 0)[0].material.materials[0], 
		// 	'bumpScale', 0.001).onChange(() => render());
		render();
		// const tloader = new THREE.TextureLoader();
		// tloader.load('models/speed_sign/30sign.jpg', tex => {
		// 	obj.children[1].material.map = tex;
		// 	scene.add(obj);
		// });
		
	});
} else if (false) { // eslint-disable-line
	var loader = new THREE.OBJMTLLoader();
	loader.load(
		// "models/traffic lights/3D model traffic lights/test.obj", "models/traffic lights/3D model traffic lights/test.mtl",
		// "models/stop_sign/stop_sign.obj", "models/stop_sign/stop_sign.mtl",
		//"models/traffic_lights_obj/semaforo.obj", "models/traffic_lights_obj/semaforo.mtl",
		// "models/traffic_lights.obj", "models/traffic_lights.mtl",
		// "models/ferrari/ferrari4.obj", "models/ferrari/ferrari4.mtl",
		// "models/stop_sign_obj/stop_sign.obj", "models/stop_sign_obj/stop_sign.mtl",
		//"models/osm/textures/map_small_blender.obj", "models/osm/textures/map_small_blender.mtl",
		"models/own.obj", "models/own.mtl", // <-- gar nicht soo schlecht!
		function(obj) {
			// obj.computeBoundingBox();
			// console.log(obj.bounding_box);
			scene.add(obj);
			//obj.children[6].children.forEach(function(o) { console.log(o.material.color.getHSL()); });
			function do_gui(obj, gui) {
				obj.children.forEach(function(o, i) {
					gui.add(o, 'visible');
					if (o.children.length > 0) {
						var f = gui.addFolder(o.name + " (" + i + ")");
						do_gui(o, f);
					} else {
						console.log(o.material);
						var c = {
							color: o.material.color.getHex(),
							emissive: o.material.emissive.getHex()
						};
						gui.addColor(c, 'color').onChange(function() {
							o.material.color.setHex(c.color);
							render();
						});
						gui.addColor(c, 'emissive').onChange(function() {
							o.material.emissive.setHex(c.emissive);
							render();
						});
						gui.__controllers.forEach(function(c) {
							if (c.__onChange === undefined)
								c.onChange(render);
						});
					}
					// o.children.forEach(function(p) {
					// 	f.add(p, 'visible');
					// 	var c = {color:p.material.color.getHex()};
					// 	gui.addColor(c, 'color').onChange(function() { p.material.color.setHex(c.color); render(); });

					// });
					// f.open();
				});
			}
			do_gui(obj, gui);

			setInterval(function() {
				//var obj2 = obj;
			}, 500);
		},
		// Function called when downloads progress
		function ( /*xhr*/ ) {
			//console.log( (xhr.loaded / xhr.total * 100) + '% loaded' );
		},
		// Function called when downloads error
		function ( /*xhr*/ ) {
			console.log( 'An error happened' );
		}
	);
} else if (false) { // eslint-disable-line
	let loader = new THREE.JSONLoader();
	loader.load(//'models/stop-sign/stop_sign.json', 
		'models/volvo.json',
		// "models/osm/textures/map_textures.json",
		function(geo,mats) {
			var mat = new THREE.MeshFaceMaterial(mats);
			var mesh = new THREE.Mesh(geo, mat);
			scene.add(mesh);
		});
} else {
	let loader = new THREE.ObjectLoader();
	var obj = loader.parse('models/semaforo7.json');
	scene.add(obj);
}
scene.add(THREE.buildAxes( 1000 ));

function render() {
	// console.log("render");
	renderer.render(scene, camera);
}

controls.rotateSpeed = 2.0;
controls.zoomSpeed = 1.2;
controls.panSpeed = 2.0;
controls.dynamicDampingFactor = 0.3;

function animate() {
	controls.update();
	requestAnimationFrame(animate);
}

controls.addEventListener('change', render);
setTimeout(render, 500);
animate();