import { io } from "socket.io-client";
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Pane } from 'tweakpane';

import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

import RightAxisWatcher from "./rightAxisWatcher";
import LeftAxisWatcher from "./LeftAxisWatcher";

var userName = prompt( "Please enter your name" );

// Create a socket
var socket = io( "http://localhost:3000" , {
    reconnectionDelayMax: 10000,
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

// Framerate
const frameRate = 30;

// Flags object
var flags = {
    isMorphSync: true,
    isAnimationSync: true
};

// Group to hold Interactable objects
var interactiveGroup;

// Slider of Timeline
var slider;

// Controllers
var geometry, controller1, controller2;

// Controller X axis watcher
var rightAxisWatcher = new RightAxisWatcher();
var leftAxisWatcher = new LeftAxisWatcher();

// Create a parent object for the camera: VRCamera Helper
const cameraRig = new THREE.Group();
scene.add( cameraRig );

// Add the camera to the parent object
cameraRig.add( camera );

// UI variables
var morphFolder, animationFolder, xrFolder, sliderMorphs=[];

// Create an AnimationMixer and a clock for animation purposes
var mixer, clock, action, currentClip;

// Create object to bind with UI TweakPane and be the Final VALUE: MORPH Object
var currentObjectSelection = {
    morphObject: 'none',
};

// Create animation object to bind ui TweakPane
var animationClipObject = {
    clip: 'none',
};

// Create a UI Pane
const pane = new Pane({
    expanded: true,
  });

// Create User Folder to show users
const userFolder = pane.addFolder({
    title: 'Online Users',
  });

// Create User Folder to show users
const followFolder = pane.addFolder({
    title: 'Follow Users',
  });

// Variable to receive the List Blade
var listFollowUsers;

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
            noXRCameraUpdate();
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
    document.getElementById( "VRButton" ).style = "hidden";
  
    // Trigger event when a not XR camera is being manipulated
    controls.addEventListener( 'change', noXRCameraUpdate );

    // Trigger event when a XR session is started
    renderer.xr.addEventListener( 'sessionstart', function( event ) {
        // Remove keyboard controls
        controls.removeEventListener( 'change', noXRCameraUpdate )
        controls.dispose();

        // Create controllers
        geometry = new THREE.BufferGeometry();
        geometry.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );

        controller1 = renderer.xr.getController( 0 );
        controller1.add( new THREE.Line( geometry ) );
        scene.add( controller1 );

        controller2 = renderer.xr.getController( 1 );
        controller2.add( new THREE.Line( geometry ) );
        scene.add( controller2 );

        // Controller Events
        controller1.addEventListener('selectstart', () => {
            console.log('Select pressed');
        });

        controller1.addEventListener('squeezestart', () => {
            console.log('Squeeze pressed');
        });

        rightAxisWatcher.addEventListener( "rightAxisChange", () => console.log( rightAxisWatcher.value ) );
        leftAxisWatcher.addEventListener( "leftAxisChange", () => console.log( leftAxisWatcher.value ) );

        const controllerModelFactory = new XRControllerModelFactory();

        const controllerGrip1 = renderer.xr.getControllerGrip( 0 );
        controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
        scene.add( controllerGrip1 );

        const controllerGrip2 = renderer.xr.getControllerGrip( 1 );
        controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
        scene.add( controllerGrip2 );

        // Set new interactive group
        interactiveGroup = new InteractiveGroup();
        interactiveGroup.listenToPointerEvents( renderer, camera );
        interactiveGroup.listenToXRControllerEvents( controller1 );
        interactiveGroup.listenToXRControllerEvents( controller2 );
        scene.add( interactiveGroup );


        // Create Timeline UI
        // Create a line curve
        const start = new THREE.Vector3(-3, -2, 0);
        const end = new THREE.Vector3(3, 2, 0);
        const lineCurve = new THREE.LineCurve3(start, end);
        // Create a tube
        const tubeGeometry = new THREE.TubeGeometry(lineCurve, 20, 0.05, 8, false);
        const tubeMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        scene.add(tube);

    }); 
}


function loadAvatar( gltfString, userCamera ) {
    // Load an avatar
    loader.load(
        // resource URL
        gltfString, 
        // called when the resource is loaded
        function ( gltf ) {
            
            let model = gltf.scene;

            // Define a new material
            let newMaterial = new THREE.MeshStandardMaterial({
                color: 0x808080, // Blue color
                metalness: 0.5,
                roughness: 0.5
            });

            // Apply material to all meshes
            model.traverse(( child ) => {
                if ( child.isMesh ) {
                    child.material = newMaterial;
                }
            });
            // Adjust position and scale down
            model.scale.set( 0.1, 0.1, 0.1 );
            model.position.y = -0.3;

            const head = model.getObjectByName('head');
            if ( head ) {
                head.rotation.z = - Math.PI / 2; // Rotate 45 degrees on the Y-axis
            } else {
                console.warn( "Head object not found in the GLB file." );
            }
            // Add to scene
            scene.add( model );
            // Make it child of camera
            userCamera.add( model );
        },
        // called while loading is progressing
        function ( xhr ) {
            console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
        },
        // called when loading has errors
        function ( error ) {
            console.log( 'An error happened loading the avatar' );
        }
    );
}


function fitCameraToObject( camera, object, offset, controls ) {
    // Compute the bounding box of the object
    const boundingBox = new THREE.Box3().setFromObject( object );
    
    // Get the size and center of the bounding box
    const size = boundingBox.getSize( new THREE.Vector3() );
    const center = boundingBox.getCenter( new THREE.Vector3() );

    // Get the max size to fit the object
    const maxDim = Math.max( size.x, size.y, size.z );

    // Compute the distance the camera should be from the object
    const fov = camera.fov * ( Math.PI / 180 ); // Convert FOV from degrees to radians
    let cameraDistance = Math.abs( maxDim / 2 / Math.tan( fov / 2 ) );

    // Apply offset factor to make the object fit nicely
    cameraDistance *= offset;

    // Set the camera position directly in front of the object
    // Assuming 'front' means along the z-axis
    const frontDirection = new THREE.Vector3( 0, 0, 1 ); // Camera positioned along positive Z axis
    const cameraPosition = center.clone().add( frontDirection.multiplyScalar( cameraDistance ) );
    
    camera.position.copy( cameraPosition );

    // Make the camera look at the center of the object
    camera.lookAt( center );

    // Optionally, update controls to target the center of the object
    if ( controls ) {
        controls.target.copy( center );
        controls.update();
    }

    // Update the camera's projection matrix after changes
    camera.updateProjectionMatrix();
}

// Function to find a blade by label
function findBladeByLabel(pane, label) {
    return pane.children.find(( child ) => child.controller.value.value_ === label);
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
    if ( mixer ) {
        mixer.update( dt );
        // Sync slider with animation
        if ( action ) {
            let progress = ( action.time / currentClip.duration ) * 100;
            slider.value = progress; // Update slider to match animation
            updateFrameNumber();
        }
    }

    controls.update();
    renderer.render( scene, camera );

    // Get Joystick Events on X axis
    const session = renderer.xr.getSession();
    if ( session ) {
        for ( const source of session.inputSources ) {
            if ( source.gamepad ) {
                const axes = source.gamepad.axes;  

                // Right Axis
                if( axes[2] === 0 && axes[2] === rightAxisWatcher.value && source.handedness == "right" )
                    continue;
                else {
                    if(source.handedness == "right" )
                        rightAxisWatcher.value = axes[2]; 
                }
                   
                // Left Axis
                if( axes[2] === 0 && axes[2] === leftAxisWatcher.value && source.handedness == "left" )
                    continue;
                else {
                    if(source.handedness == "left" )
                        leftAxisWatcher.value = axes[2];
                }
            }
        }
    }
    
}

// Initializate Scene
init();
animate();

// Emit Create Camera
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
            // Load an avatar
            loadAvatar( 'glb/avatarVr.glb', userCamera );
            
            // Ad user into Follow Dropdown
            addFollowOption( msg[ k ], msg[ k ] );

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

// Windows Behaviour & Events *****************************************

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}

// Timeline GUI *******************************************************

document.getElementById( "playPause" ).onclick = playPause;
document.getElementById( "restart" ).onclick = restart;
document.getElementById( "stop" ).onclick = stop;

function playPause() {
    if ( action ){
        // Emit play
        if( flags.isAnimationSync == true )
            socket.emit( 'play', animationClipObject.clip, action.time, animationFolder.children[1].controller.value.rawValue );
        if( action.isRunning() !== true ) {
            action.paused = false;
            action.play();
        }
        else
            action.paused = true;
    } 
}

function restart() {
    if ( action ){
        // Emit restart
        if( flags.isAnimationSync == true )
            socket.emit( 'restart', animationClipObject.clip, animationFolder.children[1].controller.value.rawValue );
        action.reset();
    }
}

function stop() {
    if ( action ){
        // Emit stop
        if( flags.isAnimationSync == true )
            socket.emit( 'stop' );
        action.stop();
    }
}

// Get Slider
slider = document.getElementById( "myTimeline" );

// Grabbing Timeline
slider.addEventListener( "input", ( event ) => {
    if ( action ) {
        if( action.isRunning() !== true ) 
            action.play();
        action.paused = true;
        let sliderValue = event.target.value / 100; // Normalize value
        action.time = sliderValue * currentClip.duration;
        mixer.update(0); // Apply the new time
        updateFrameNumber();
        // Emit value
        if( flags.isAnimationSync == true )
            socket.emit( 'grabbing', action.time );
    }
});

function updateFrameNumber() {
    let frameNumber = document.getElementById( "frameNumber" )
    let value = slider.value;
    frameNumber.textContent = value.toString().padStart(4, '0');;
}

function handleFollowUser( user ) {
    console.log(user);

// Text on Slider!!!!!
    const slider = document.getElementById("myRange2");
    const sliderValue = document.getElementById("slider-value");
    sliderValue.textContent = user;

    function updateSliderValue() {
        const sliderRect = slider.getBoundingClientRect();
        const min = slider.min;
        const max = slider.max;
        const value = slider.value;

        // Calculate percentage of the thumb position
        const percent = (value - min) / (max - min);
        const offset = (percent+0.04) * (sliderRect.width - 15); // Adjust for thumb width

        // Move the text dynamically
        sliderValue.style.left = `${offset}px`;
        //sliderValue.textContent = value;
    }

    // Update on input
    slider.addEventListener("input", updateSliderValue);

    // Initialize position
    updateSliderValue(); 

}



// GUI ***************************************************************

// Functions to add and remove itens from Follow Unsynced Users
function addFollowOption( text, value ) {
    const newOptions = [...listFollowUsers.options, { text, value }];
    listFollowUsers.options = newOptions ;
}

function removeFollowOption( valueToRemove ) {
    const newOptions = listFollowUsers.options.filter( opt => opt.value !== valueToRemove );
    listFollowUsers.options = newOptions;
}

// Create the UI
function createGUI( model, animations) {
    // Objects with morphs
    let objectsWithMorphTargets = [];
    // Create object to bind with UI Options
    let objectOptions = {
        none: 'none',
    };

    let morphNameTargets = [];
    // Create object to bind with ui options
    let animationOptions = {
        none: 'none',
    };
    
    // Create animation loop boolean object to bind ui
    let animationLoop = {
        loop: false,
      };
    
    // Create the Follow Dropdown menu and attribute a variable to get the list
    listFollowUsers = followFolder.addBlade({
        view: 'list',
        label: 'user',
        options: [
          {text: 'none', value: 'none'}
        ],
        value: 'none',
      });

      listFollowUsers.on( "change", function( ev ){
        handleFollowUser( ev.value ); 
      });

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
        
        // Add sync option
        morphFolder.addBinding( flags, 'isMorphSync',  { label: 'sync', });


        // Event Handler for Morph Pane
        morphFolder.on( 'change', function( ev ) {        
            
                if( isNaN( ev.value ) === true ){
                    // Object List changed
                    currentObjectSelection.morphObject = ev.value;
                    
                    // Clear if it is NONE
                    if (ev.value === 'none'){
                        for( let i = morphFolder.children.length-1; i > 0; i-- ) {
                            morphFolder.children[ i ].dispose();
                        }
                        // Add sync option
                        morphFolder.addBinding( flags, 'isMorphSync', { label: 'sync', });
                        // Emit change of the object to none
                        if( flags.isMorphSync == true )
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
                            morphFolder.children[ i ].dispose();
                        }    
                    }

                    // Create the UI sliders
                    for( let i = 0; i < morphNameTargets.length; i++ ){
                        sliderMorphs[ i ] = {};
                        sliderMorphs[ i ][ morphNameTargets [ i ] ] = model.getObjectByName( ev.value ).morphTargetInfluences[ i ];
                        morphFolder.addBinding( sliderMorphs[ i ], morphNameTargets [ i ], {
                            min: 0,
                            max: 1,
                        });
                    } 

                    // Add sync option
                    morphFolder.addBinding( flags, 'isMorphSync', { label: 'sync', });

                    // Emit change of the object
                    if( flags.isMorphSync == true )
                        socket.emit( 'onObjectMorphChange', ev.value );
                } else {

                    if( ev.target.label === "sync" && ev.value == true ){
                        return;
                    }
                   
                    // Sliders changed
                    if( ev.target.label !== "sync" )
                        model.getObjectByName( currentObjectSelection.morphObject ).morphTargetInfluences[ morphNameTargets.indexOf( ev.target.label ) ] = ev.value ;
   
                    if( ev.last !== true ){
                         // Emit Morph Target Slider Info
                        if( flags.isMorphSync == true )
                            socket.emit( 'onSliderMorphChange', currentObjectSelection.morphObject, morphNameTargets.indexOf( ev.target.label ), ev.value );

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
            animationOptions[ animations[ i ].name ] = animations[ i ].name;
        }

        // Create UI Pane
        animationFolder = pane.addFolder({
            title: 'Animation',
          });
        animationFolder.addBinding( animationClipObject, 'clip', {
            options: animationOptions,
        });

        // Add loop option
        animationFolder.addBinding( animationLoop, 'loop');

        // Add sync option
        animationFolder.addBinding( flags, 'isAnimationSync', { label: 'sync', } );
 
        // Event Handler for Morph Pane
        animationFolder.on( 'change', function( ev ) {  

            if( ev.target.label === "clip" && ev.value !== "none" ){
                // Emit change of the clip
                if( flags.isAnimationSync == true )
                    socket.emit( 'onClipChange', ev.value );                        
                // Prepare the action object to play a specific animation
                let clip = THREE.AnimationClip.findByName( animations, ev.value );
                // Save as a global variable
                currentClip = THREE.AnimationClip.findByName( animations, ev.value );

                if( action )
                    action.stop();
                action = mixer.clipAction( clip );
                action.clampWhenFinished = true // pause in the last keyframe
                action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat )
                // Prepare the Timeline
                slider.max = Math.round( clip.duration * frameRate );
                slider.value = 1;
                updateFrameNumber();
            }

            if( ev.target.label === "clip" && ev.value === "none" ){
                // Emit change of the clip
                if( flags.isAnimationSync == true )
                    socket.emit( 'onClipChange', ev.value ); 
                if ( action )
                    action.stop();
                action = null;
                currentClip = null;
            }

            if( ev.target.label === "loop" && action ){
                if( flags.isAnimationSync == true )
                    socket.emit( 'onLoopChange', ev.value ); 
                action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat ) 
            }

            if( ev.target.label === "loop" && action == null ){
                if( flags.isAnimationSync == true )
                    socket.emit( 'onLoopChange', ev.value ); 
            }

            if( ev.target.label === "sync" && ev.value == true){
                if ( action ) {
                    action.reset();
                    action.stop();
                }
            }

        });
    }

    // Create VR Folder
    xrFolder = pane.addFolder({
        title: 'VR Setup',
    });

    const VRButton = xrFolder.addButton({
        title: document.getElementById( "VRButton" ).textContent
      });
    
    VRButton.on('click', () => {
        document.getElementById( "VRButton" ).click();
    });
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

    // Load an avatar
    loadAvatar( 'glb/avatarVr.glb', userCamera );
    noXRCameraUpdate();
});

// Behavior when receives morph target new values
socket.on( 'onSliderMorphChange', function( object, morphTarget, value ) {
    // Check if current Morph object is the same of the synced one
    if( currentObjectSelection.morphObject != object ){
        currentObjectSelection.morphObject = object;
    }
        
    let key = Object.keys( sliderMorphs[ morphTarget ] )
    if( sliderMorphs[ morphTarget ][ key ] !== value ){
        sliderMorphs[ morphTarget ][ key ] = value;
        pane.refresh();
    }
});

// Behavior when receives object morph changes
socket.on( 'onObjectMorphChange', function( value ) {
        morphFolder.children[0].controller.value.rawValue = value;
});

// Behavior when a user connects
socket.on( 'userConnected', function( msg ) {
    console.log( msg + " has connected " );
    
    // Add online users connected to the pane but not the current user
    if( msg !== userName ) {
        // Add user into Follow DropDown
        addFollowOption( msg, msg );

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
    // remove user from list of follow
    removeFollowOption( msg );
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
    tempCameraHelper.camera.position.set(msg.x, msg.y, msg.z);
    tempCameraHelper.camera.rotation.set(msg.lx, msg.ly, msg.lz);
    tempCameraHelper.camera.updateProjectionMatrix();
    tempCameraHelper.update();
});   

// On clip change
socket.on( 'onClipChange', function( clip ){
    if( flags.isAnimationSync == true )
        animationFolder.children[0].controller.value.rawValue = clip;
}); 

// On loop change
socket.on( 'onLoopChange', function( value ){
    if( flags.isAnimationSync == true )
        animationFolder.children[1].controller.value.rawValue = value;
}); 

// Play animation
socket.on( 'play', function( clip, time, loop ){
    if( flags.isAnimationSync == true ){

        if( animationClipObject.clip != clip )
            animationFolder.children[0].controller.value.rawValue = clip;

        if( animationFolder.children[1].controller.value.rawValue != loop )
            animationFolder.children[1].controller.value.rawValue = loop;

        if ( action ){
            action.time = time;
            mixer.update(0); // Apply the new time
            updateFrameNumber();

            if( action.isRunning() !== true ) {
                action.paused = false;
                action.play();
            }
            else
                action.paused = true;
        }
    }
}); 

// Restart animation
socket.on( 'restart', function( clip, loop ){
    if( flags.isAnimationSync == true ){
        if( animationClipObject.clip != clip )
            animationFolder.children[0].controller.value.rawValue = clip;

        if( animationFolder.children[1].controller.value.rawValue != loop )
            animationFolder.children[1].controller.value.rawValue = loop;

        if( action ) {
            action.reset();
            action.play();
        }
    }
}); 

// Stop animation
socket.on( 'stop', function(){
    if( flags.isAnimationSync == true ){
        if( action )
            action.stop();
    }
});

// Grabbing timeline
socket.on( 'grabbing', function( value ){
    if( flags.isAnimationSync == true ){
            if( action ) {
                if( action.isRunning() !== true ) 
                    action.play();
                action.paused = true;
                action.time = value;
                mixer.update(0); // Apply the new time
                updateFrameNumber();
        }
    }
});