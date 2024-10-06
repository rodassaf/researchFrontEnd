import { io } from "socket.io-client";
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//import init from "three/examples/jsm/offscreen/scene.js";

var userName = prompt( "Please enter your name" );

// Create a socket
var socket = io( "http://localhost:3000" , {
    reconnectionDelayMax: 10000 ,
    auth: {
        token: "123"
    },
    query: {
        "userName":  userName
    } 
});

// Global variables
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const renderer = new THREE.WebGLRenderer();
const controls = new OrbitControls( camera, renderer.domElement );

// Instantiate a loader
const loader = new GLTFLoader();

function init() { 
    scene.background = new THREE.Color( 0x444444 );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.xr.enabled = true;

	// lights
    const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x8d8d8d, 3 );
    hemiLight.position.set( 0, 20, 0 );
    scene.add( hemiLight );

    const dirLight = new THREE.DirectionalLight( 0xffffff, 3 );
    dirLight.position.set( 0, 20, 10 );
    scene.add( dirLight );

    // Flag to know if a VR session has started
    // console.log(renderer.xr.isPresenting);

    // Load a glTF resource
    loader.load(
        // resource URL
        'glb/RobotExpressive.glb',
        // called when the resource is loaded
        function ( gltf ) {
            scene.add( gltf.scene );
            gltf.animations; // Array<THREE.AnimationClip>
            gltf.scene; // THREE.Group
            gltf.scenes; // Array<THREE.Group>
            gltf.cameras; // Array<THREE.Camera>
            gltf.asset; // Object
            
            fitCameraToObject(camera, gltf.scene, 1.6, controls);
        },
        // called while loading is progressing
        function ( xhr ) {
            console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
        },
        // called when loading has errors
        function ( error ) {
            console.log( 'An error happened' );
        }
    );

    document.body.appendChild( renderer.domElement );
    document.body.appendChild( VRButton.createButton( renderer ) );
  
    // Trigger event when a not XR camera is being manipulated
    controls.addEventListener( 'change', noXRCameraUpdate );

    // Trigger event when a XR session is started
    renderer.xr.addEventListener( 'sessionstart', function( event ) {
        controls.dispose();
    }); 
}


function fitCameraToObject(camera, object, offset, controls) {
    // Compute the bounding box of the object
    const boundingBox = new THREE.Box3().setFromObject(object);
    
    // Get the size and center of the bounding box
    const size = boundingBox.getSize(new THREE.Vector3());
    const center = boundingBox.getCenter(new THREE.Vector3());

    // Get the max size to fit the object
    const maxDim = Math.max(size.x, size.y, size.z);

    // Compute the distance the camera should be from the object
    const fov = camera.fov * (Math.PI / 180); // Convert FOV from degrees to radians
    let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    // Apply offset factor to make the object fit nicely
    cameraDistance *= offset;

    // Set the camera position directly in front of the object
    // Assuming 'front' means along the z-axis (you can modify this axis if needed)
    const frontDirection = new THREE.Vector3(0, 0, 1); // Camera positioned along positive Z axis
    const cameraPosition = center.clone().add(frontDirection.multiplyScalar(cameraDistance));
    
    camera.position.copy(cameraPosition);

    // Make the camera look at the center of the object
    camera.lookAt(center);

    // Optionally, update controls to target the center of the object
    if (controls) {
        controls.target.copy(center);
        controls.update();
    }

    // Update the camera's projection matrix after changes
    camera.updateProjectionMatrix();
}



function noXRCameraUpdate () {
    socket.emit( 'updateCamera', { 
        userName: userName,
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        lx: camera.rotation.x,
        ly: camera.rotation.y,
        lz: camera.rotation.z 
        } 
    );
}

function animate() {
  //requestAnimationFrame( animate );
  renderer.setAnimationLoop( render );
}

function render() {
  controls.update();
  renderer.render( scene, camera );
}

init();

animate();

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}


// Behavior when receives CreateCamera msg
socket.on( 'createCamera', function( msg ) {
    // msg is the userNamer
    console.log( msg );
    let userCamera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
    scene.add(userCamera);
    let cameraHelper = new THREE.CameraHelper( userCamera );
    cameraHelper.name = msg;
    scene.add( cameraHelper );
});

// Behavior when a user connects
socket.on( 'userConnected', function( msg ) {
    console.log( msg );
});

// Behavior when a user disconnects
socket.on( 'userDisconnected', function( msg ) {
    console.log( msg + ' has disconnected' );
    let tempCameraHelper = scene.getObjectByName( msg );
    if( tempCameraHelper !== null ){
        let tempCamera = tempCameraHelper.camera;
        scene.remove( tempCameraHelper );
        tempCameraHelper.dispose();
        scene.remove( tempCamera );
    }
});

socket.on( 'updateCamera', function( msg ){
    let tempCameraHelper = scene.getObjectByName( msg.userName );
    console.log(tempCameraHelper);
    tempCameraHelper.camera.position.set(msg.x, msg.y, msg.z);
    //tempCameraHelper.position.set(msg.x, msg.y, msg.z);
    tempCameraHelper.camera.rotation.set(msg.lx, msg.ly, msg.lz);
    // tempCameraHelper.rotation.set(msg.lx, msg.ly, msg.lz);
    tempCameraHelper.camera.updateProjectionMatrix();
    tempCameraHelper.update();
});   

// Emit Creating Camera
socket.emit( 'createCamera', userName );

// Check existing users and add their cameras - only happens one time
socket.once( 'checkWhosOnline', function( msg ){
    if( msg.length > 0 ){
        for( let k=0; k<msg.length; k++ ){
            let userCamera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
            let cameraHelper = new THREE.CameraHelper( userCamera );
            cameraHelper.name = msg[ k ];
            scene.add( userCamera );
            scene.add( cameraHelper );
        }
        console.log('Added '+msg.length+' Cameras')
    }
});
