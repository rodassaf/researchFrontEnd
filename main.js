import { io } from "socket.io-client";
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {Pane} from 'tweakpane';


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

// UI variables
var morphFolder, animationFolder, sliderMorphs=[];

// Create an AnimationMixer and a clock for animation purposes
var mixer, clock, action;

// Create a UI Pane
const pane = new Pane({
    expanded: true,
  });
// Create User Folder to show users
const userFolder = pane.addFolder({
    title: 'Online Users',
  });

// Instantiate a loader
const loader = new GLTFLoader();

// Start 3D scene
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

    // Create a clock
    clock = new THREE.Clock();

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
            gltf.scenes; // Array<THREE.Group>
            gltf.cameras; // Array<THREE.Camera>
            gltf.asset; // Object
            
            fitCameraToObject( camera, gltf.scene, 1.6, controls );
            createGUI( gltf.scene, gltf.animations );
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
    // Assuming 'front' means along the z-axis
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

// Function to find a blade by label
function findBladeByLabel(pane, label) {
    return pane.children.find((child) => child.controller.value.value_ === label);
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
    
    let dt = clock.getDelta();
    if ( mixer ) mixer.update( dt );
    controls.update();
    renderer.render( scene, camera );
}

// Initializate Scene
init();
animate();

// Windows Behaviour *****************************************

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}


// GUI *******************************************************

function createGUI( model, animations) {
    // Objects with morphs
    let objectsWithMorphTargets = [];
    // Create object to bind with UI Options
    let objectOptions = {
        none: 'none',
    };
    // Create object to bind with UI and be the Final VALUE
    let currentObjectSelection = {
        morphObject: 'none',
    };
    let morphNameTargets = [];
    // Create object to bind with ui options
    let animationOptions = {
        none: 'none',
    };
    // Create animation object to bind ui
    let animationClipObject = {
        clip: 'none',
      };
    
    // Create animation loop boolean object to bind ui
    let animationLoop = {
        loop: false,
      };
    
    // Find objects with Morphs or Blendshapes
    model.traverseVisible( ( object ) => {
            if ( object.isMesh && object.geometry.morphAttributes ) {
                // Check if the object has morph targets
                const hasMorphTargets = object.geometry.morphAttributes.position || object.geometry.morphAttributes.normal;
                
                if ( hasMorphTargets ) {
                    // Push this object into array to be used on pane
                    objectsWithMorphTargets.push( object.name );
                }
            }
        }
    );

    // Feed the binded object for options
    for( let i = 0; i < objectsWithMorphTargets.length; i++ ){
        objectOptions[objectsWithMorphTargets[i]] = objectsWithMorphTargets[i];
    }
  
    // If there is morph target
    if( objectsWithMorphTargets.length > 0 ) {
        // Create Morph Folder
        morphFolder = pane.addFolder({
            title: 'Morph Targets',
          });

        // Add a Blade
        morphFolder.addBinding(currentObjectSelection, 'morphObject', {
            options: objectOptions,
          }); 

        // Event Handler for Morph Pane
        morphFolder.on( 'change', function( ev ) {            
                if( isNaN( ev.value ) === true ){
                    // Object List changed
                    currentObjectSelection.morphObject = ev.value;
                    
                    // Clear if it is NONE
                    if (ev.value === 'none'){
                        for( let i = morphFolder.children.length-1; i > 0; i-- ) {
                            morphFolder.children[i].dispose();
                        }   
                        // Emit change of the object to none
                        socket.emit( 'onObjectMorphChange', ev.value );
                        return;
                    }
                    // Clear NameTargets
                    morphNameTargets = [];
                    // Feed the object of Morph Targets by getting the list of strings and associate the values
                    morphNameTargets = Object.keys( model.getObjectByName( ev.value ).morphTargetDictionary  ) ;
                    
                    // Reset UI from Last item until the second one
                    if( morphFolder.children.length > 1 ){
                        for( let i = morphFolder.children.length-1; i > 0; i-- ) {
                            morphFolder.children[i].dispose();
                        }    
                    }

                    // Create the UI
                    for( let i = 0; i < morphNameTargets.length; i++ ){
                        sliderMorphs[ i ] = {};
                        sliderMorphs[ i ][ morphNameTargets [ i ] ] = model.getObjectByName( ev.value ).morphTargetInfluences[ i ];
                        morphFolder.addBinding( sliderMorphs[ i ], morphNameTargets [ i ], {
                            min: 0,
                            max: 1,
                        });
                    } 
                    // Emit change of the object
                    socket.emit( 'onObjectMorphChange', ev.value );
                } else {
                    if( ev.last !== true ){
                        // Sliders changed
                        model.getObjectByName(  currentObjectSelection.morphObject ).morphTargetInfluences[ morphNameTargets.indexOf( ev.target.label ) ] = ev.value ;
                        // Emit Morph Target Slider Info
                        socket.emit( 'onSliderMorphChange', morphNameTargets.indexOf( ev.target.label ), ev.value  );
                        console.log( ev.value )
                    }
                }
          });
    }

    // If there are animations
    if ( animations.length > 0 ) {

        // Create an AnimationMixer, and get the list of AnimationClip instances
        mixer = new THREE.AnimationMixer( model );

        // Feed the binded object for options
        for( let i = 0; i < animations.length; i++ ){
            animationOptions[animations[i].name] = animations[i].name;
        }

        // Create UI Pane
        animationFolder = pane.addFolder({
            title: 'Animation',
          });
        animationFolder.addBinding(animationClipObject, 'clip', {
            options: animationOptions,
        });

        // Add loop option
        animationFolder.addBinding(animationLoop, 'loop');

        // Add button Play
        const btnPlayPause = animationFolder.addButton({
            title: 'Play | Pause',
          });

        // Add button Restart
        const btnRestart = animationFolder.addButton({
            title: 'Restart',
          });

        // Add button Stop
        const btnStop = animationFolder.addButton({
            title: 'Stop',
          });
 
 
        // Event Handler for Morph Pane
        animationFolder.on( 'change', function( ev ) {  

            if( ev.target.label === "clip" && ev.value !== "none" ){
                // Emit change of the clip
                socket.emit( 'onClipChange', ev.value );                        
                // Prepare the action object to play a specific animation
                let clip = THREE.AnimationClip.findByName( animations, ev.value );
                if( action )
                    action.stop();
                action = mixer.clipAction( clip );
                action.clampWhenFinished = true // pause in the last keyframe
                action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat )               
            }

            if( ev.target.label === "clip" && ev.value === "none" ){
                // Emit change of the clip
                socket.emit( 'onClipChange', ev.value ); 
                action.stop();
                action = null;
            }

            if( ev.target.label === "loop" && action ){
                socket.emit( 'onLoopChange', ev.value ); 
                action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat ) 
            }

            if( ev.target.label === "loop" && action == null ){
                socket.emit( 'onLoopChange', ev.value ); 
            }  
        });

        // On PlayPaused clicked
        btnPlayPause.on( "click", () => {

            if ( action ){
                // Emit play
                socket.emit( 'play' );
                if( action.isRunning() !== true ) {
                    action.paused = false;
                    action.play();
                }
                else
                    action.paused = true;
            } 
        });

        // On Restart clicked
        btnRestart.on( "click", () => {
            if ( action ){
                // Emit restart
                socket.emit( 'restart' );
                action.reset();
            }
        });

        // On Stop clicked
        btnStop.on( "click", () => {
            if ( action ){
                // Emit play
                socket.emit( 'stop' );
                action.stop();
            }
        });

    }

}

// Sockets ***************************************************

// Behavior when receives CreateCamera msg
socket.on( 'createCamera', function( msg ) {
    // msg is the userNamer
    console.log( msg );
    let userCamera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
    scene.add( userCamera );
    let cameraHelper = new THREE.CameraHelper( userCamera );
    cameraHelper.name = msg;
    scene.add( cameraHelper );
});

// Behavior when receives morph target new values
socket.on( 'onSliderMorphChange', function( morphTarget, value ) {
    
    let key = Object.keys(sliderMorphs[ morphTarget ])
    if( sliderMorphs[ morphTarget ][ key ] !== value ){
        sliderMorphs[ morphTarget ][ key ] = value;
        pane.refresh();
    }
});

// Behavior when receives object morph changes
socket.on( 'onObjectMorphChange', function( value ) {
    morphFolder.children[0].controller.value.rawValue = value;
    //currentObjectSelection.morphObject = value;
});

// Behavior when a user connects
socket.on( 'userConnected', function( msg ) {
    console.log( msg + " has connected " );
    
    // Add online users connected to the pane but not the current user
    if( msg !== userName ) {
        userFolder.addBlade({
        view: 'text',
        label: 'user',
        parse: ( v ) => String( v ),
        value: msg,
        });
    }
});

// Behavior when a user disconnects
socket.on( 'userDisconnected', function( msg ) {
    console.log( msg + " has disconnected " );
    let tempCameraHelper = scene.getObjectByName( msg );
    if( tempCameraHelper !== null ){
        let tempCamera = tempCameraHelper.camera;
        scene.remove( tempCameraHelper );
        tempCameraHelper.dispose();
        scene.remove( tempCamera );
    }

    // Find the 'name' blade and remove it
    let bladeDisposal = findBladeByLabel( userFolder, msg );
    bladeDisposal.dispose();
});

socket.on( 'updateCamera', function( msg ){
    let tempCameraHelper = scene.getObjectByName( msg.userName );
   // console.log(tempCameraHelper);
    tempCameraHelper.camera.position.set(msg.x, msg.y, msg.z);
    //tempCameraHelper.position.set(msg.x, msg.y, msg.z);
    tempCameraHelper.camera.rotation.set(msg.lx, msg.ly, msg.lz);
    // tempCameraHelper.rotation.set(msg.lx, msg.ly, msg.lz);
    tempCameraHelper.camera.updateProjectionMatrix();
    tempCameraHelper.update();
});   

// On clip change
socket.on( 'onClipChange', function( clip ){
    animationFolder.children[0].controller.value.rawValue = clip;
}); 

// On loop change
socket.on( 'onLoopChange', function( value ){
    animationFolder.children[1].controller.value.rawValue = value;
}); 

// Play animation
socket.on( 'play', function(){
    if ( action ){
        if( action.isRunning() !== true ) {
            action.paused = false;
            action.play();
        }
        else
            action.paused = true;
    }
}); 

// Restart animation
socket.on( 'restart', function(){
    if ( action )
        action.reset();
}); 

// Stop animation
socket.on( 'stop', function(){
    if ( action )
        action.stop();
}); 

// Emit Creating Camera
socket.emit( 'createCamera', userName );

// Check existing users and add their cameras - only happens one time
socket.once( 'checkWhosOnline', function( msg ){
    // Add current user to the pane
    userFolder.addBlade({
    view: 'text',
    label: 'user (me)',
    parse: ( v ) => String( v ),
    value: userName,
    });

    // If there are more users online
    if( msg.length > 0 ){
        for( let k=0; k<msg.length; k++ ){
            let userCamera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
            let cameraHelper = new THREE.CameraHelper( userCamera );
            cameraHelper.name = msg[ k ];
            scene.add( userCamera );
            scene.add( cameraHelper );
            
            // Add online users connected to the pane
            userFolder.addBlade({
                view: 'text',
                label: 'user',
                parse: ( v ) => String( v ),
                value: msg[ k ],
              });
        }
        console.log('Added '+msg.length+' Cameras')
    }
});
