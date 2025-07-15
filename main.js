import { io } from "socket.io-client";
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Pane } from 'tweakpane';
import ThreeMeshUI from 'three-mesh-ui'; 
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

import RightAxisWatcher from "./rightAxisWatcher";
import LeftAxisWatcher from "./LeftAxisWatcher";
import { userData } from "three/tsl";

var userName = prompt( "Please enter your name" );
userName = userName.toString();

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

// Global variables ***************************************************************
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
var slider, sliderName;

// Controllers
var geometry, controller1, controller2;

// Controller X axis watcher
var rightAxisWatcher = new RightAxisWatcher();
var leftAxisWatcher = new LeftAxisWatcher();

// Variable to check XR Camera position
let lastPosition = new THREE.Vector3();
let lastQuaternion = new THREE.Quaternion();

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

// Create animation loop boolean object to bind ui
var animationLoop = {
    loop: false,
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

// List of users and sync info as objects
var arrayUsers = [];

// Variable to receive the List Blade
var listFollowUsers;

// XR Handle (the timeline handle)
var handle;

// XR Variable to indicate if the user is selecting a state
var selectState = false;

//XR Array to hold XR buttons to test
var objsToTest = [];

// Raycaster 
var raycaster;

// XR UI 
var onlineUsersText = null;
var animationCurrentText = null;
var morphCurrentText = null;
var animationLoopText = null;
var followIndex = 0;
var morphIndex = 0;
var animationIndex = 0;

// Create the Follow Dropdown menu and attribute a variable to get the list
listFollowUsers = followFolder.addBlade({
    view: 'list',
    label: 'user',
    options: [
        { text: 'none', value: 'none' }
    ],
    value: 'none',
});

// Var to indicate who I am following
var followUser = "none";

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

    // Create a raycaster
    raycaster = new THREE.Raycaster();

    // Flag to know if a VR session has started
    // console.log(renderer.xr.isPresenting);

    // Load a glTF resource
    loader.load(
        // resource URL
        'glb/RobotExpressive.glb',
        // called when the resource is loaded
        function ( gltf ) {
            gltf.scene.scale.set( 0.4, 0.4, 0.4 );
            scene.add( gltf.scene );
            gltf.animations; // Array<THREE.AnimationClip>
            gltf.scenes; // Array<THREE.Group>
            gltf.cameras; // Array<THREE.Camera>
            gltf.asset; // Object
            
            fitCameraToObject( camera, gltf.scene, 1.6, controls );
            noXRCameraUpdate();
            createGUI( gltf.scene, gltf.animations );

            // Trigger event when a XR session is started
            renderer.xr.addEventListener( 'sessionstart', ( event ) => { startXR( gltf.animations ) } );
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
    document.getElementById( "VRButton" ).style.visibility = "hidden";
  
    // Trigger event when a not XR camera is being manipulated
    controls.addEventListener( 'change', noXRCameraUpdate );

}

// XR **************************************************************************
function startXR( animations ) {
    console.log(animations)
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

    // When the controller is connected we can store 3 properties into a custom object named userData (which is attached to any object in threejs)
    controller1.addEventListener( 'connected', ( event ) => {
        controller1.userData.inputSource = event.data;
        controller1.userData.gamepad = event.data.gamepad;
        controller1.userData.buttons = new Array( event.data.gamepad.buttons.length ).fill( false );
    });

    controller1.addEventListener( 'disconnected', () => {
        delete controller1.userData.inputSource;
        delete controller1.userData.gamepad;
    });

    // Basic Controller Events
    controller1.addEventListener('selectstart', () => {
        selectState = true;
    });

    controller1.addEventListener('selectend', () => {
        selectState = false;
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

    // ************** three-mesh-ui panel setup ********************************
    // Remove any previous panel if needed
    if ( scene.getObjectByName( 'xrUIPanel' ) ) {
        scene.remove( scene.getObjectByName( 'xrUIPanel' ) );
    }

    // Create the main panel
     const panel = new ThreeMeshUI.Block({
        width: 1.2,
        height: 2.0,
        padding: 0.05,
        fontSize: 0.045,
        justifyContent: 'start',
        textAlign: 'center',
        backgroundColor: new THREE.Color( 0x222233 ),
        backgroundOpacity: 0.8,
        borderRadius: 0.10,
        fontFamily: './assets/Roboto-msdf.json', // adjust path as needed
        fontTexture: './assets/Roboto-msdf.png'
    });
    panel.name = 'xrUIPanel';
    panel.position.set( 0, 1.5, -1.5 );
    
    scene.add( panel );

    // Helper to create a label row
    function addLabelRow( text ) {
        const row = new ThreeMeshUI.Block({ width: 1.1, height: 0.08, margin: 0.01, padding: 0.01, backgroundOpacity: 1, borderRadius: 0.03, backgroundColor: new THREE.Color(0x777777) });
        row.add( new ThreeMeshUI.Text({ content: text }) );
        panel.add( row );
        return row;
    }

    // Buttons Configuration
	const buttonOptions = {
		width: 0.2,
		height: 0.1,
		justifyContent: 'center',
		offset: 0.05,
		margin: 0.02,
		borderRadius: 0.055
	};

	const hoveredStateAttributes = {
		state: 'hovered',
		attributes: {
			offset: 0.035,
			backgroundColor: new THREE.Color( 0x999999 ),
			backgroundOpacity: 1,
			fontColor: new THREE.Color( 0xffffff )
		},
	};

	const idleStateAttributes = {
		state: 'idle',
		attributes: {
			offset: 0.035,
			backgroundColor: new THREE.Color( 0x666666 ),
			backgroundOpacity: 0.8,
			fontColor: new THREE.Color( 0xffffff )
		},
	};

    const selectedAttributes = {
		offset: 0.02,
		backgroundColor: new THREE.Color( 0x777777 ),
		fontColor: new THREE.Color( 0x222222 )
	};

    // Online Users
    addLabelRow( 'Online Users:' );
    const onlineUsersPanel = new ThreeMeshUI.Block({ width: 1.1, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, backgroundOpacity: 0 });
    onlineUsersText = new ThreeMeshUI.Text({ content: arrayUsers.length > 0 ? arrayUsers.join( ', ' ) : 'None' });  //Global variable to hold online users
    onlineUsersPanel.add( onlineUsersText );
    panel.add( onlineUsersPanel );
    
    // Follow User Dropdown
    addLabelRow( 'Follow User:' );
    const followUsersPanel = new ThreeMeshUI.Block({ width: 1.1, height: 0.12, margin: 0.02, padding: 0.0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0, justifyContent: 'space-between' });
    const followCurrentUsersTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    const followCurrentUsersText = new ThreeMeshUI.Text({ content: 'none' });
    followCurrentUsersTextPanel.add( followCurrentUsersText );
    const followUsersTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    const followUsersText = new ThreeMeshUI.Text({ content: 'none' });
    followUsersTextPanel.add( followUsersText );
    const buttonSelectFollowUser = new ThreeMeshUI.Block( buttonOptions );
    buttonSelectFollowUser.add( new ThreeMeshUI.Text( { content: 'next' } ));
    const buttonApplyFollowUser = new ThreeMeshUI.Block( buttonOptions );
    buttonApplyFollowUser.add( new ThreeMeshUI.Text( { content: 'apply' } ));

	buttonSelectFollowUser.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {
            if ( followIndex < listFollowUsers.options.length - 1 ) 
                followIndex++;
            else 
                followIndex = 0;

            followUsersText.set( { content: listFollowUsers.options[ followIndex ].value } );
		}
	});

	buttonSelectFollowUser.setupState( hoveredStateAttributes );
	buttonSelectFollowUser.setupState( idleStateAttributes );

    buttonApplyFollowUser.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {

		    followCurrentUsersText.set( { content: listFollowUsers.options[ followIndex ].value } );

		}
	});

	buttonApplyFollowUser.setupState( hoveredStateAttributes );
	buttonApplyFollowUser.setupState( idleStateAttributes );

    followUsersPanel.add( followUsersTextPanel, buttonSelectFollowUser, buttonApplyFollowUser );
    panel.add( followCurrentUsersTextPanel, followUsersPanel )
    objsToTest.push( buttonSelectFollowUser, buttonApplyFollowUser );

    // Morph Targets Dropdown
    addLabelRow( 'Morph Object:' );
    const morphPanel = new ThreeMeshUI.Block({ width: 1.1, height: 0.1, margin: 0.02, padding: 0.0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0, justifyContent: 'space-between' });
    const morphCurrentTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    morphCurrentText = new ThreeMeshUI.Text({ content: 'None' });
    const morphTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    const morphText = new ThreeMeshUI.Text({ content: 'None' });
    morphTextPanel.add( morphText );
    morphCurrentTextPanel.add( morphCurrentText );
    const buttonSelectMorph = new ThreeMeshUI.Block( buttonOptions );
    buttonSelectMorph.add( new ThreeMeshUI.Text( { content: 'next' } ));
    const buttonApplyMorph = new ThreeMeshUI.Block( buttonOptions );
    buttonApplyMorph.add( new ThreeMeshUI.Text( { content: 'apply' } ));

	buttonSelectMorph.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {
             if ( morphIndex < morphFolder.children[ 0 ].options.length - 1 ) 
                morphIndex++;
            else 
                morphIndex = 0;

            morphText.set( { content: morphFolder.children[ 0 ].options[ morphIndex ].value } ); 
		}
	});

	buttonSelectMorph.setupState( hoveredStateAttributes );
	buttonSelectMorph.setupState( idleStateAttributes );

    buttonApplyMorph.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {

		    morphCurrentText.set( { content: morphFolder.children[ 0 ].options[ morphIndex ].value } );
            // Emit change to server
            if( flags.isMorphSync === true )
                socket.emit( 'onObjectMorphChange', morphFolder.children[ 0 ].options[ morphIndex ].value );

		}
	});

	buttonApplyMorph.setupState( hoveredStateAttributes );
	buttonApplyMorph.setupState( idleStateAttributes );

    morphPanel.add( morphTextPanel, buttonSelectMorph, buttonApplyMorph );
    panel.add( morphCurrentTextPanel, morphPanel )
    objsToTest.push( buttonSelectMorph, buttonApplyMorph );

    // Morph Sync Checkbox
    const morphCheckPanel = new ThreeMeshUI.Block({ width: 1.1, height: 0.12, margin: 0.02, padding: 0.0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0, justifyContent: 'space-between' });
    const morphCheckTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.12, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    const morphCheckText = new ThreeMeshUI.Text({ content: 'Sync: ON' });
    morphCheckTextPanel.add( morphCheckText );
    const buttonMorphSync = new ThreeMeshUI.Block( buttonOptions );
    buttonMorphSync.add( new ThreeMeshUI.Text( { content: 'on/off' } ));

	buttonMorphSync.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {

		    flags.isMorphSync = !flags.isMorphSync;
            morphCheckText.set( { content: flags.isMorphSync ? 'Sync: ON' : 'Sync: OFF' } );
                    
        }
	});

	buttonMorphSync.setupState( hoveredStateAttributes );
	buttonMorphSync.setupState( idleStateAttributes );

    morphCheckPanel.add( morphCheckTextPanel, buttonMorphSync );
    panel.add( morphCheckPanel )
    objsToTest.push( buttonMorphSync );

    // Animation Clip Dropdown
    addLabelRow( 'Animation Clip:' );
    const animationPanel = new ThreeMeshUI.Block({ width: 1.1, height: 0.1, margin: 0.02, padding: 0.0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0, justifyContent: 'space-between' });
    const animationTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    const animationText = new ThreeMeshUI.Text({ content: 'none' });
    const animationCurrentTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    animationCurrentText = new ThreeMeshUI.Text({ content: 'none' });
    animationTextPanel.add( animationText );
    animationCurrentTextPanel.add( animationCurrentText );
    const buttonSelectAnimation = new ThreeMeshUI.Block( buttonOptions );
    buttonSelectAnimation.add( new ThreeMeshUI.Text( { content: 'next' } ));
    const buttonApplyAnimation = new ThreeMeshUI.Block( buttonOptions );
    buttonApplyAnimation.add( new ThreeMeshUI.Text( { content: 'apply' } ));

	buttonSelectAnimation.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {
            if ( animationIndex < animationFolder.children[ 0 ].options.length - 1 ) 
                animationIndex++;
            else 
                animationIndex = 0;

            animationText.set( { content: animationFolder.children[ 0 ].options[ animationIndex ].value } );
		}
	});

	buttonSelectAnimation.setupState( hoveredStateAttributes );
	buttonSelectAnimation.setupState( idleStateAttributes );

    buttonApplyAnimation.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {
            // Update the text
		    animationCurrentText.set( { content: animationFolder.children[ 0 ].options[ animationIndex ].value } );
            // Save as a global variable
            currentClip = THREE.AnimationClip.findByName( animations, animationFolder.children[ 0 ].options[ animationIndex ].value );

            if( action )
                action.stop();
            action = mixer.clipAction( currentClip );
            action.clampWhenFinished = true // pause in the last keyframe
            action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat )

            socket.emit( 'onClipChange', animationFolder.children[ 0 ].options[ animationIndex ].value, flags.isAnimationSync, userName );   

		}
	});

	buttonApplyAnimation.setupState( hoveredStateAttributes );
	buttonApplyAnimation.setupState( idleStateAttributes );

    animationPanel.add( animationTextPanel, buttonSelectAnimation, buttonApplyAnimation );
    panel.add( animationCurrentTextPanel, animationPanel )
    objsToTest.push( buttonSelectAnimation, buttonApplyAnimation );

    // Animation Sync Checkbox
    const animationSyncPanel = new ThreeMeshUI.Block({ width: 1.1, height: 0.12, margin: 0.02, padding: 0.0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0, justifyContent: 'space-between' });
    const animationSyncTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.12, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    const animationSyncText = new ThreeMeshUI.Text({ content: 'Sync: ON' });
    animationSyncTextPanel.add( animationSyncText );
    const buttonAnimationSync = new ThreeMeshUI.Block( buttonOptions );
    buttonAnimationSync.add( new ThreeMeshUI.Text( { content: 'on/off' } ));

	buttonAnimationSync.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {

		    flags.isAnimationSync = !flags.isAnimationSync;
            animationSyncText.set( { content: flags.isAnimationSync ? 'Sync: ON' : 'Sync: OFF' } );

            if ( action ) 
                action.paused = true;
           
            if( flags.isAnimationSync === true ) 
                socket.emit( 'addSyncUser', userName, currentClip ); 
            else
                socket.emit( 'removeSyncUser', userName, currentClip );

		}
	});

	buttonAnimationSync.setupState( hoveredStateAttributes );
	buttonAnimationSync.setupState( idleStateAttributes );

    animationSyncPanel.add( animationSyncTextPanel, buttonAnimationSync );
    panel.add( animationSyncPanel )
    objsToTest.push( buttonAnimationSync );

    // Animation Loop Checkbox
    const animationLoopPanel = new ThreeMeshUI.Block({ width: 1.1, height: 0.12, margin: 0.02, padding: 0.0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0, justifyContent: 'space-between' });
    const animationLoopTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.12, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    animationLoopText = new ThreeMeshUI.Text({ content: 'Loop: OFF' });
    animationLoopTextPanel.add( animationLoopText );
    const buttonAnimationLoop = new ThreeMeshUI.Block( buttonOptions );
    buttonAnimationLoop.add( new ThreeMeshUI.Text( { content: 'on/off' } ));

	buttonAnimationLoop.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {
            
            animationLoop.loop = !animationLoop.loop;
            animationLoopText.set( { content: animationLoop.loop ? 'Loop: ON' : 'Loop: OFF' } );

		    if( flags.isAnimationSync === true ) {
                socket.emit( 'onLoopChange', animationLoop.loop ); 
                if( action )
                    action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat )
            }
		}
	});

	buttonAnimationLoop.setupState( hoveredStateAttributes );
	buttonAnimationLoop.setupState( idleStateAttributes );

    animationLoopPanel.add( animationLoopTextPanel, buttonAnimationLoop );
    panel.add( animationLoopPanel )
    objsToTest.push( buttonAnimationLoop );
 
    // Create Timeline UI
    // Load a glTF resource
    loader.load(
        // resource URL
        'glb/timeline.glb',
        // called when the resource is loaded
        function ( gltf ) {
            gltf.scene.scale.set( 8, 8, 8 );
            gltf.scene.rotation.y = - Math.PI / 2;
            gltf.scene.position.y = 0.04;
            controller1.add( gltf.scene );

            // Find and get the mesh Handle by name
            handle = scene.getObjectByName('handle');
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
} 

// Function to make XR buttons work
function updateButtons() {

	// Find closest intersecting object
	let intersect;

	//vrControl.setFromController( 0, raycaster.ray );
    raycaster.setFromXRController( controller1 );
	intersect = raycast();

	// Position the little white dot at the end of the controller pointing ray
	if ( intersect ) 
        raycaster.set( 0, intersect.point );

	// Update targeted button state (if any)
	if ( intersect && intersect.object.isUI ) {
		if ( selectState ) {
			// Component.setState internally call component.set with the options you defined in component.setupState
			intersect.object.setState( 'selected' );

		} else {
			// Component.setState internally call component.set with the options you defined in component.setupState
			intersect.object.setState( 'hovered' );
		}
	}

	// Update non-targeted buttons state
	objsToTest.forEach( ( obj ) => {

		if ( ( !intersect || obj !== intersect.object ) && obj.isUI ) {
			// Component.setState internally call component.set with the options you defined in component.setupState
			obj.setState( 'idle' );
		}
	});

}

function raycast() {

	return objsToTest.reduce( ( closestIntersection, obj ) => {

		const intersection = raycaster.intersectObject( obj, true );

		if ( !intersection[ 0 ] ) 
            return closestIntersection;

		if ( !closestIntersection || intersection[ 0 ].distance < closestIntersection.distance ) {
			intersection[ 0 ].object = obj;
			return intersection[ 0 ];
		}

		return closestIntersection;

	}, null );
}

function trackVRHeadset() {
    // Get WebXR camera
    let xrCamera = renderer.xr.getCamera( camera ); 
    
    // Get head position
    let position = xrCamera.position.clone();
    // Get head rotation (Quaternion)
    let quaternion = xrCamera.quaternion.clone();
  
    // Check if position or rotation changed
    if ( !position.equals( lastPosition ) || !quaternion.equals( lastQuaternion ) ) {
        // Update last values
        lastPosition.copy( position );
        lastQuaternion.copy( quaternion );
        rotateFaceAvatar( lastPosition, lastQuaternion );
    }
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
function findBladeByLabel( pane, label ){
    return pane.children.find(( child ) => child.controller.value.value_ === label );
}

function noXRCameraUpdate(){
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

function rotateFaceAvatar( pos, quat ){
    socket.emit( 'updateXRCamera', { 
        userName: userName,
        pos: pos,
        rot: quat
        } 
    );
}

function getRandomHexColor() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

function animate() {
    //requestAnimationFrame( animate );
    renderer.setAnimationLoop( render );
}

function render() {
    let dt = clock.getDelta();

    //Is there a XR Session?
    const session = renderer.xr.getSession();

    if ( mixer ) {
        mixer.update( dt );
        // Sync slider with animation
        if ( action && action.isRunning() ) {
            //let progress = ( action.time / currentClip.duration ) * 100;
            let currentFrame = Math.round( action.time * frameRate );
            slider.value = currentFrame; // Update slider to match animation
            socket.emit( 'timelineUserFollow', userName, currentFrame, currentClip );
            updateFrameNumber();
            // Update my slider user name (me)
            updateSliderValue( slider, sliderName );

            if ( session ) {
                handle.morphTargetInfluences[ 0 ] = currentFrame/100;
            }

        }
    }

    controls.update();
    renderer.render( scene, camera );

    // Emit camera position to others who want to follow me
    socket.emit( 'cameraUserFollow', userName, camera.position, camera.rotation );

    // XR Session to get controllers buttons
    if ( session ) {

        // Sync Avatar head with VR Headset
        trackVRHeadset();

        // Update XR UI
        ThreeMeshUI.update();
        // Handle controllers
        updateButtons();

        if ( controller1.userData && controller1.userData.inputSource ) {

            const gamepad = controller1.userData.gamepad;

            gamepad.buttons.forEach( ( button, index ) => {
                
                const previouslyPressed = controller1.userData.buttons[ index ];
               
                // Check if the button is on hold
                if ( button.pressed && previouslyPressed )
                        console.log("HOLD " + `${index}` )

                // Check which button is pressedf
                if ( button.pressed && !previouslyPressed ) {
                    console.log( `Button ${index} just pressed` );
                    if( index === 4 ) 
                        playPause();
                    if( index === 5 ) 
                        restart();
                    controller1.userData.buttons[ index ] = true;
                } else if (!button.pressed && previouslyPressed) { // Release button
                controller1.userData.buttons[ index ] = false;
                }
            });
            
        } 
  
/*         for ( const source of session.inputSources ) {
            if ( source.gamepad ) {
                const axes = source.gamepad.axes;  

                // Right Axis
                if( axes[ 2 ] === 0 && axes[ 2 ] === rightAxisWatcher.value && source.handedness == "right" )
                    continue;
                else {
                    if(source.handedness == "right" )
                        rightAxisWatcher.value = axes[ 2 ]; 
                }
                
                // Left Axis
                if( axes[ 2 ] === 0 && axes[2] === leftAxisWatcher.value && source.handedness == "left" )
                    continue;
                else {
                    if(source.handedness == "left" )
                        leftAxisWatcher.value = axes[ 2 ];
                }
            }
        } */
    }
    
}

// Initializate Scene
init();
animate();

// Emit Create Camera
socket.emit( 'createCamera', userName );



// ********************************************************************

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
        if( flags.isAnimationSync == true ) {
            socket.emit( 'play', animationClipObject.clip, action.time, animationFolder.children[ 1 ].controller.value.rawValue, userName );
        } 
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
            socket.emit( 'restart', animationClipObject.clip, animationFolder.children[ 1 ].controller.value.rawValue );
        action.reset();
        action.play();
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

// Get Slider and name
slider = document.getElementById( "myTimeline" );
sliderName = document.getElementById( "sliderString" );
updateSliderValue( slider, sliderName );

// Grabbing Timeline
slider.addEventListener( "input", ( event ) => {
    if ( action ) {
        if( action.isRunning() !== true ) 
            action.play();
        action.paused = true;
        const currentFrame = parseInt( event.target.value );
        action.time =  Math.min( currentClip.duration, currentFrame / frameRate );
        mixer.update( 0 ); // Apply the new time
        updateFrameNumber();
        updateSliderValue( slider, sliderName );
        //let progress = ( action.time / currentClip.duration ) * 100;
        let progress = Math.round( action.time * frameRate );
        // Emit value
        socket.emit( 'grabbing', action.time, progress, flags.isAnimationSync, userName, animationFolder.children[ 0 ].controller.value.rawValue );

        if( arrayUsers.length > 0 && flags.isAnimationSync ){
            for( let i=0; i<arrayUsers.length; i++ ){
                
                // Get the sliders from others
                let sliderTemp = document.getElementById( "slider" + arrayUsers[i].toString() );
                let sliderValueTemp = document.getElementById( "sliderString" + arrayUsers[i].toString() );
                
                sliderTemp.value = progress; // Update slider to match animation
                updateSliderValue( sliderTemp, sliderValueTemp );
            }
        }

        // Update Synced ones

    } else {
        updateSliderValue( slider, sliderName );
    }
});

function updateFrameNumber() {
    let frameNumber = document.getElementById( "frameNumber" );
    let value = slider.value;
    frameNumber.textContent = value.toString().padStart(4, '0');
}

function handleFollowUser( user ) {

    followUser = user;
    if( user !== "none" ){
        // Remove keyboard controls
        controls.enabled = false;
    } else {
        // Add keyboard controls back
        controls.enabled = true;
    }
}

// Function to update Slider Value
function updateSliderValue( slider, sliderValue ) {
    const sliderRect = slider.getBoundingClientRect();
    const min = slider.min;
    const max = slider.max;
    const value = slider.value;

    // Calculate percentage of the thumb position
    const percent = ( value - min ) / ( max - min );
    const offset = ( percent + 0.04 ) * ( sliderRect.width - 15 ); // Adjust for thumb width

    // Move the text dynamically
    sliderValue.style.left = `${offset}px`;
    //sliderValue.textContent = value;
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
        objectOptions[ objectsWithMorphTargets[ i ] ] = objectsWithMorphTargets[ i ];
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
                // if( flags.isAnimationSync == true )
                socket.emit( 'onClipChange', ev.value, flags.isAnimationSync, userName );                        
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
                updateSliderValue( slider, sliderName );
            }

            if( ev.target.label === "clip" && ev.value === "none" ){
                // Emit change of the clip
              //  if( flags.isAnimationSync == true )
                socket.emit( 'onClipChange', ev.value, flags.isAnimationSync, userName ); 
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
                    action.paused = true;
                }

                socket.emit( 'addSyncUser', userName, currentClip ); 

                if ( arrayUsers.length > 0 && flags.isAnimationSync ){
                    for( const user of arrayUsers ){
                        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
                        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
                    }
                }

                 // Print the names on the slider
                document.getElementById( "sliderString" ).innerHTML = [...arrayUsers, "me"].join('<br>');
            
            }

            if( ev.target.label === "sync" && ev.value == false){
                if ( action ) {
                    action.paused = true;
                }

                socket.emit( 'removeSyncUser', userName, currentClip );

                 // Print me on the slider
                document.getElementById( "sliderString" ).innerHTML = "me";


                // Leave one slider Thumb of the synced ones
                if ( arrayUsers.length > 0 ){
                    // Get at least one representant of the synced users
                    document.getElementById( "slider" + arrayUsers[0].toString() ).style.visibility = "visible";
                    document.getElementById( "sliderString" + arrayUsers[0].toString() ).style.visibility = "visible";
                     // Print the names on the slider
                    document.getElementById( "sliderString" + arrayUsers[0].toString() ).innerHTML = [...arrayUsers].join('<br>');
                    // Make sure that the value is the same When we turn off Sync
                    document.getElementById( "slider" + arrayUsers[0].toString() ).value = slider.value;
                    updateSliderValue( document.getElementById( "slider" + arrayUsers[0].toString() ), document.getElementById( "sliderString" + arrayUsers[0].toString() ) ); 
                    // Hide the rest
                    if( arrayUsers.length > 1) {
                        for(let i = 1; i<arrayUsers.length; i++){
                             // Hide
                            document.getElementById( "slider" + arrayUsers[i].toString() ).style.visibility = "hidden";
                            document.getElementById( "sliderString" + arrayUsers[i].toString() ).style.visibility = "hidden";
                        }
                    }
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
    if( flags.isMorphSync == true ){
        // Check if current Morph object is the same of the synced one
        if( currentObjectSelection.morphObject != object ){
            currentObjectSelection.morphObject = object;
        }
            
        let key = Object.keys( sliderMorphs[ morphTarget ] )
        if( sliderMorphs[ morphTarget ][ key ] !== value ){
            sliderMorphs[ morphTarget ][ key ] = value;
            pane.refresh();
        }
    }
});

// Behavior when receives object morph changes
socket.on( 'onObjectMorphChange', function( value ) {
    if( flags.isMorphSync == true ){
        morphFolder.children[0].controller.value.rawValue = value;
        // Update XR UI if it exists
        if ( morphCurrentText !== null ) 
            morphCurrentText.set( { content: value } );
    }
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

         // Create Timeline Sliders and its attributes
        let slider = document.createElement( 'input' );
        slider.style.setProperty( '--thumb-color', getRandomHexColor() );
        slider.type = 'range';
        slider.min = '1';
        slider.max = '100';
        slider.value = '1';
        slider.className = 'sliderConnected';
        slider.id = 'slider' + msg;
        // Create Slider Name
        let sliderString = document.createElement( 'span' );
        sliderString.id = "sliderString" + msg;
        sliderString.className = "slider-value";
        sliderString.style.visibility = "hidden";
        sliderString.innerHTML = msg;
        // Add into the scene
        document.querySelector('.sliderContainer4Connected').appendChild(slider);
        document.querySelector('.sliderContainer4Connected').appendChild(sliderString);

        arrayUsers.push( msg );
        // Print the names on the slider
        document.getElementById( "sliderString" ).innerHTML = [...arrayUsers, 'me'].join('<br>');

        // Update XR UI 
        if (onlineUsersText !== null) {
            onlineUsersText.set( { content: arrayUsers.join(', ') } );  
        }
    }
});

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
            
            // Add user into Follow Dropdown
            addFollowOption( msg[ k ], msg[ k ] );

            // Add online users connected to the pane
            userFolder.addBlade({
                view: 'text',
                label: 'user',
                parse: ( v ) => String( v ),
                value: msg[ k ],
            });

            arrayUsers.push( msg[ k ] );
            // Print the names on the slider
            document.getElementById( "sliderString" ).innerHTML = [...arrayUsers, 'me'].join('<br>');

            // Update XR UI 
            if ( onlineUsersText !== null ) {
                onlineUsersText.set( { content: arrayUsers.join(', ') } );  
            }

            if( document.getElementById( "slider" + msg[ k ].toString() ) == null ){
                // Create Timeline Sliders and its attributes
                let slider = document.createElement( 'input' );
                slider.style.setProperty( '--thumb-color', getRandomHexColor() );
                slider.type = 'range';
                slider.min = '1';
                slider.max = '100';
                slider.value = '1';
                slider.className = 'sliderConnected';
                slider.id = 'slider' + msg[ k ];
                // Create Slider Name
                let sliderString = document.createElement( 'span' );
                sliderString.id = "sliderString" + msg[ k ];
                sliderString.className = "slider-value";
                sliderString.style.visibility = "hidden";
                sliderString.innerHTML = msg[ k ];
                // Add into the scene
                document.querySelector('.sliderContainer4Connected').appendChild(slider);
                document.querySelector('.sliderContainer4Connected').appendChild(sliderString);
            }       
            
        }
        console.log('Added '+msg.length+' Cameras');
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

    // Remove user from list of users synced if he/she is there
    const index = arrayUsers.indexOf( msg );
    if( index !== -1 ) {
        arrayUsers.splice( index, 1 );
    }

    // Find the 'name' blade and remove it
    let bladeDisposal = findBladeByLabel( userFolder, msg );
    bladeDisposal.dispose();

    let slider = document.getElementById( "slider" + msg.toString() );
    let sliderValue = document.getElementById( "sliderString" + msg.toString() );
    slider.remove();
    sliderValue.remove();

    if( flags.isAnimationSync )
        // Print the names on the slider
        document.getElementById( "sliderString" ).innerHTML = [ ...arrayUsers, "me" ].join( '<br>' );

    // Update XR UI 
    if (onlineUsersText !== null) {
        onlineUsersText.set( { content: arrayUsers.join(', ') } );  
    }
});

// On non XR camera change
socket.on( 'updateCamera', function( msg ){
    let tempCameraHelper = scene.getObjectByName( msg.userName );
    tempCameraHelper.camera.position.set( msg.x, msg.y, msg.z );
    tempCameraHelper.camera.rotation.set( msg.lx, msg.ly, msg.lz );
    tempCameraHelper.camera.updateProjectionMatrix();
    tempCameraHelper.update();
});

// On XR camera change
socket.on( 'updateXRCamera', function( msg ){
    let tempCameraHelper = scene.getObjectByName( msg.userName );
    let mycamera = tempCameraHelper.camera;
    mycamera.position.copy( msg.pos );
   let quaternion = new THREE.Quaternion( msg.rot[ 0 ], msg.rot[ 1 ], msg.rot[ 2 ], msg.rot[ 3 ] );
    mycamera.quaternion.copy( quaternion );
    mycamera.updateProjectionMatrix();
    tempCameraHelper.update();
});  

// On clip change
socket.on( 'onClipChange', function( clip, sync, user ){
    // Check if there is a XR session
    const session = renderer.xr.getSession()

    // Update the UI
    if( flags.isAnimationSync == true && sync == true ){
        if( animationFolder.children[ 0 ].controller.value.rawValue != clip ) 
            animationFolder.children[ 0 ].controller.value.rawValue = clip;
        if( session )
            animationCurrentText.set( { content: clip } );
    }

    // Check if it is the same clip running
    if( currentClip && clip == currentClip.name ) {

        if( flags.isAnimationSync == true && sync == true){
            document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + user ).style.visibility = "hidden";
        }
        else{
            document.getElementById( "slider" + user.toString() ).style.visibility = "visible";
            document.getElementById( "sliderString" + user ).style.visibility = "visible";
        }

        // Prepare the Timeline
        let userFollowSlider = document.getElementById( "slider" + user.toString() );
        userFollowSlider.max = Math.round( currentClip.duration * frameRate );
        userFollowSlider.value = 1;
        updateSliderValue( userFollowSlider, document.getElementById( "sliderString" + user.toString() ) )

    } else {
        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
    }

    // Make sure the slider is hidden when NONE is selected
    if( clip.name == "none" ){
        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
    }

    // Consult who has the Same Clip or Not REVIEW THIS!!!!!!!!
    socket.emit( 'askClip', currentClip, userName, sync );     
  
}); 

// On loop change
socket.on( 'onLoopChange', function( value ){
    if( flags.isAnimationSync == true ) {
        animationFolder.children[ 1 ].controller.value.rawValue = value;
        // Update XR UI if it exists
        if ( animationLoopText !== null )
            animationLoopText.set( { content: value ? 'Loop: ON' : 'Loop: OFF' } ); 
    }
}); 

// Play animation
socket.on( 'play', function( clip, time, loop ){
    if( flags.isAnimationSync == true ){

        if( animationClipObject.clip != clip )
            animationFolder.children[ 0 ].controller.value.rawValue = clip;

        if( animationFolder.children[ 1 ].controller.value.rawValue != loop )
            animationFolder.children[ 1 ].controller.value.rawValue = loop;

        if ( action ){
            action.time = time;
            mixer.update( 0 ); // Apply the new time
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

// Play animation of a follow user
socket.on( 'timelineUserFollow', function( user, currentFrame, clip ){

    if( currentClip && clip.name == currentClip.name ){
     
        // Get the sliders
        let slider = document.getElementById( "slider" + user.toString() );
        let sliderValue = document.getElementById( "sliderString" + user.toString() );
       
        // Initialize position
        slider.value = currentFrame;
        updateSliderValue( slider, sliderValue ); 
    }
}); 

// Follow camera User
socket.on( 'cameraUserFollow', function( user, cameraPosition, cameraRotation ){ 
    if( followUser !== "none" ){
        camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        camera.rotation.set(cameraRotation.x, cameraRotation.y, cameraRotation.z);
    }

});

// Restart animation
socket.on( 'restart', function( clip, loop ){
    if( flags.isAnimationSync == true ){
        if( animationClipObject.clip != clip )
            animationFolder.children[ 0 ].controller.value.rawValue = clip;

        if( animationFolder.children[ 1 ].controller.value.rawValue != loop )
            animationFolder.children[ 1 ].controller.value.rawValue = loop;

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

// Update the sliders
socket.on( 'askSync', function( user, sync, progress ){
    if( flags.isAnimationSync == true && sync == true ){
        
            // Get the sliders from others
            let slider = document.getElementById( "slider" + user.toString() );
            let sliderValue = document.getElementById( "sliderString" + user.toString() );
            
            slider.value = progress;
            updateSliderValue( slider, sliderValue ); 
            return;
    }
});

// Update Sliders
socket.on( 'askClip', function( clip, user, sync ){

    // Check if it is the same clip running
    if( currentClip && clip && clip.name == currentClip.name ) {
        if( flags.isAnimationSync == true && sync == true && arrayUsers.length > 0){
            document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
        }
        else{
            document.getElementById( "slider" + user.toString() ).style.visibility = "visible";
            document.getElementById( "sliderString" + user.toString() ).style.visibility = "visible";
        }


        
        // Prepare the Timeline
        let userFollowSlider = document.getElementById( "slider" + user.toString() );
        userFollowSlider.max = Math.round( currentClip.duration * frameRate );
        updateSliderValue( userFollowSlider, document.getElementById( "sliderString" + user.toString() ) ); 
        //userFollowSlider.value = 1;

    } else {
        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
    }

    // Make sure the slider is hidden when NONE is selected
    if( !clip || clip.name == "none" ){
        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
    }
});

// Add Sync User
socket.on( 'addSyncUser', function( user, clip ){

    if( currentClip && clip && clip.name == currentClip.name ) {
        arrayUsers.push( user );

        if( flags.isAnimationSync ) {
            document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
            // Print the names on the slider
            document.getElementById( "sliderString" ).innerHTML = [ ...arrayUsers, "me" ].join( '<br>' );
        } else {
            if( arrayUsers.length > 1 ) {
                document.getElementById( "sliderString" + arrayUsers[ arrayUsers.length-1 ].toString() ).innerHTML = [ ...arrayUsers ].join( '<br>' );
                for( let i = 0; i < arrayUsers.length-1; i++ ){
                    console.log(arrayUsers[ i ])
                    document.getElementById( "slider" + arrayUsers[ i ].toString() ).style.visibility = "hidden";
                    document.getElementById( "sliderString" + arrayUsers[ i ].toString() ).style.visibility = "hidden";
                }
            }
        }
    }
});

// Remove Sync User
socket.on( 'removeSyncUser', function( user, clip ){
    // Remove user from list of users synced if he/she is there
    const index = arrayUsers.indexOf( user );
    if( index !== -1 ) 
        arrayUsers.splice( index, 1 );

    if( currentClip && clip && clip.name == currentClip.name ) {
        document.getElementById( "slider" + user.toString() ).style.visibility = "visible";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "visible";
        document.getElementById( "sliderString" + user.toString() ).innerHTML = user.toString();
       // document.getElementById( "slider" + user.toString() ).value = slider.value;
       // updateSliderValue( document.getElementById( "slider" + user.toString() ), document.getElementById( "sliderString" + user.toString() ) ); 

    }
    else{
        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
    }

    if( arrayUsers.length > 1 && arrayUsers.length != 1) {
        for(let i = 1; i<arrayUsers.length; i++){
             // Hide
            document.getElementById( "slider" + arrayUsers[i].toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + arrayUsers[i].toString() ).style.visibility = "hidden";
        }
    }

    if( arrayUsers.length == 1 && !flags.isAnimationSync && currentClip && clip && clip.name == currentClip.name ) {
        document.getElementById( "slider" + arrayUsers[ 0 ].toString() ).style.visibility = "visible";
        document.getElementById( "sliderString" + arrayUsers[ 0 ].toString() ).style.visibility = "visible";
    }

    if( flags.isAnimationSync )
        // Print the names on the slider
        document.getElementById( "sliderString" ).innerHTML = [ ...arrayUsers, "me" ].join( '<br>' );



});

// Grabbing timeline
socket.on( 'grabbing', function( value, progress, sync, user, clip ){
    
    // ReTell everyone what is the current status
    //socket.emit( 'askSync', userName, flags.isAnimationSync, progress );
    const session = renderer.xr.getSession()

    if( flags.isAnimationSync == true && sync == true ){
        if( animationClipObject.clip != clip ) {
            animationFolder.children[ 0 ].controller.value.rawValue = clip;
            if ( session )
                animationCurrentText.set( { content: clip } );
        }

        if( action ) {
            if( action.isRunning() !== true ) 
                action.play();
            action.paused = true;
            action.time = value;
            mixer.update( 0 ); // Apply the new time
            
            // Update the current slider
            document.getElementById( "myTimeline" ).value = progress; // Update slider to match animation

            if( session ){        
                handle.morphTargetInfluences[ 0 ] = progress/100;
            }
                          
            // Update local slider name (me) 
            updateSliderValue( slider, sliderName );
            updateFrameNumber();

            // Update all synced
            if( arrayUsers.length > 0 ){
                for( let i=0; i<arrayUsers.length; i++ ){
                    // Get the sliders from others
                    let sliderTemp = document.getElementById( "slider" + arrayUsers[i].toString() );
                    let sliderValueTemp = document.getElementById( "sliderString" + arrayUsers[i].toString() );
                    
                    sliderTemp.value = progress; // Update slider to match animation
                    updateSliderValue( sliderTemp, sliderValueTemp );
                }
            }
        }
    }

    if( currentClip && clip && clip == currentClip.name ){
         // Get the sliders from others
         let sliderTemp = document.getElementById( "slider" + user.toString() );
         let sliderValueTemp = document.getElementById( "sliderString" + user.toString() );
         
         sliderTemp.value = progress; // Update slider to match animation
         updateSliderValue( sliderTemp, sliderValueTemp );

        if( arrayUsers.length > 1 ){
            for( let i=0; i<arrayUsers.length; i++ ){
                
                // Get the sliders from others
                let sliderTemp = document.getElementById( "slider" + arrayUsers[i].toString() );
                let sliderValueTemp = document.getElementById( "sliderString" + arrayUsers[i].toString() );
                
                sliderTemp.value = progress; // Update slider to match animation
                updateSliderValue( sliderTemp, sliderValueTemp );
            }
        }
    }

});