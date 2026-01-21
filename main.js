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
import { array, temp, userData } from "three/tsl";

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
    } ,
    transports: ["websocket"]
});

// Global variables ***************************************************************
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const followCamera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const miniRT = new THREE.WebGLRenderTarget(256, 256); // Mini render target for the follow camera XR Use Case
const renderer = new THREE.WebGLRenderer();
const controls = new OrbitControls( camera, renderer.domElement );
const pointerSize = 0.02; // Pointer size in meters

// Toggle to turn Camera Helper ON or OFF
var cameraHelperVisibility = false; 

// Framerate
const frameRate = 30;

// Flags object
var flags = {
    isMorphSync: true,
    isAnimationSync: true
};

// Synced Object States
var syncStates = {
    clip: 'none',
    frame: 0,
    isPlaying: false,
    isLooping: false
};

// Group to hold Interactable objects
var interactiveGroup;

// Slider of Timeline
var slider, sliderName;

// Controllers
var geometry, controller1, controller2;

// Var to get the model when it is loaded
var meshModel = [];

// Mouse and Shift key flag
var mouse = new THREE.Vector2();
var isShiftDown = false;

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

// List of morph targets
var morphNameTargets = [];

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

// Following me
var userFollowingMe = "none";

// XR UI 
var panel = null;
var onlineUsersText = null;
var animationCurrentText = null;
var morphCurrentText = null;
var morphOptionText = null;
var animationLoopText = null;
var xrSliderThumb = null;
var panelHandle = null;
var xrFrameText = null;
var xrAnimationSliderTrack = null;
var xrMorpherSliderTrack = null;
var xrSliderMorpherThumb = null;
var xrMorpherValueText = null;
var xrAnimationDragging = false;
var panelDragging = false;
var xrMorpherDragging = false;
var followIndex = 0;
var morphIndex = 0;
var morphChannelIndex = 0;
var animationIndex = 0;
let grabOffset = 0;
var xrPointer = false;
var miniScreen = null;
let sliderXAxis = new THREE.Vector3();
let sliderNormal = new THREE.Vector3();
let sliderCenter = new THREE.Vector3();
var buttonAnimationSync = null;

// I am using this just to grab the label and change its color when someone follows me in VR mode
var tempFollowLabel = null;
var tempAnimationLabel = null;

// Plane used for dragging hanlde in free space
const hitPointWorld = new THREE.Vector3();
const grabOffsetWorld = new THREE.Vector3();
let dragDistance = 0; // distance along ray
const prevCtrlPos = new THREE.Vector3();
const currCtrlPos = new THREE.Vector3();

// Face to camera variables
const camPos = new THREE.Vector3();
const handlePos = new THREE.Vector3();
const lookDir = new THREE.Vector3();

const minX = -0.5;
const maxX = 0.5;

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

// Start 3D scene *****************************************************************
function init() { 
    scene.background = new THREE.Color( 0xa0a0a0 );
	scene.fog = new THREE.Fog( 0xa0a0a0, 10, 30 );

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

    // ground
    let mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2000, 2000 ), new THREE.MeshPhongMaterial( { color: 0x999999, depthWrite: false } ) );
    mesh.rotation.x = - Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add( mesh );

    let grid = new THREE.GridHelper( 2000, 3290, 0x000000, 0x000000 );
    grid.material.opacity = 0.1;
    grid.material.transparent = true;
    scene.add( grid );

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
            
            // Create a array of Mesh to be used for raycasting
            gltf.scene.traverse(o => { if (o.isMesh) meshModel.push(o); });

            // Create a pointer to see where I am pointing
            let pointer = new THREE.Mesh(
                new THREE.SphereGeometry(pointerSize, 16, 16),             // radius ~3cm
                new THREE.MeshBasicMaterial({ color: 0x00ff00 })
            );
            pointer.name = "pointer" + userName.toString();
            pointer.visible = false;
            scene.add( pointer );

            fitCameraToObject( camera, gltf.scene, 1.6, controls );
            noXRCameraUpdate();
            createGUI( gltf.scene, gltf.animations );

            // Trigger event when a XR session is started
            renderer.xr.addEventListener( 'sessionstart', ( event ) => {
                // Start XR
                startXR( gltf.animations, gltf.scene );
            } );
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
function startXR( animations, model ) {

    // Remove keyboard controls
    controls.removeEventListener( 'change', noXRCameraUpdate )
    controls.dispose();

    // Create controllers
    geometry = new THREE.BufferGeometry();
    geometry.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );

     // Assign Left and Right Controllers before starting XR
    let session = renderer.xr.getSession();
    let inputSources = session.inputSources;

    controller1 = renderer.xr.getController( 1 );
    controller1.add( new THREE.Line( geometry ) );
    scene.add( controller1 );

    controller2 = renderer.xr.getController( 0 );
    controller2.add( new THREE.Line( geometry ) );
    scene.add( controller2 );

    // Create a mini scene and camera to be rendered on the controller
    const miniScreenGeometry = new THREE.PlaneGeometry(0.2, 0.2); // small square
    const miniScreenMaterial = new THREE.MeshBasicMaterial({
        map: miniRT.texture,
        side: THREE.DoubleSide,
        transparent: true
    });
    miniScreen = new THREE.Mesh(miniScreenGeometry, miniScreenMaterial);
    miniScreen.name = "miniScreen";
    miniScreen.visible = false;

    // Add to meshModels so users can also pick
    meshModel.push(miniScreen)

    // Attach to controller
    controller2.add( miniScreen );
    miniScreen.position.set(0, 0.15, -0.1); // offset forward from controller

/*     // Fix controllers 
    session.addEventListener('inputsourceschange', () => {
        const inputSources = session.inputSources;

        for (let i = 0; i < inputSources.length; i++) {
            if (inputSources[i].handedness === 'right') {
                controller1 = renderer.xr.getController(i);
                console.log( "Right controller found at index: " + i );
            } else if (inputSources[i].handedness === 'left') {
                controller2 = renderer.xr.getController(i);
                console.log( "Left controller found at index: " + i );
            }
        }
    }); */

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

        const intersections = raycaster.intersectObjects( [ xrSliderThumb, xrSliderMorpherThumb, panelHandle ], true );
    
        if ( intersections.length >= 1 ) { //just found out that buttons have 4 intersections, so add this condition I make sure it is only the thumbnail
           
            let hitObject = intersections[0].object.parent;
            if (!hitObject) return;

            // We have a thumb hit; get its id and the hit point
            const hitPoint = intersections[0].point.clone();

             if ( hitObject.userData.sliderId === 'xrSliderThumb' ) {
                console.log("xrSliderThumb selected");
                xrAnimationDragging = true;

                // Get the world position of the thumb (not the track)
                let thumbWorldPos = new THREE.Vector3().setFromMatrixPosition( xrSliderThumb.matrixWorld );

                // Slider direction (X) and plane normal (Y)
                sliderCenter.setFromMatrixPosition( xrAnimationSliderTrack.matrixWorld );
                sliderXAxis.set(1, 0, 0).applyQuaternion( xrAnimationSliderTrack.quaternion ).normalize();
                sliderNormal.set(0, 0, 1).applyQuaternion( xrAnimationSliderTrack.quaternion ).normalize();

                // Vector from thumb center to ray hit
                const hitOffsetVec = new THREE.Vector3().subVectors( hitPoint, thumbWorldPos );
                grabOffset = hitOffsetVec.dot( sliderXAxis ); // signed offset from center of thumb

            } 
            
            if ( hitObject.userData.sliderId === 'xrSliderMorpherThumb' ) {
                console.log("xrSliderMorpherThumb selected");
                xrMorpherDragging = true;

                // Get the world position of the thumb (not the track)
                let thumbWorldPos = new THREE.Vector3().setFromMatrixPosition( xrSliderMorpherThumb.matrixWorld );

                // Slider direction (X) and plane normal (Y)
                sliderCenter.setFromMatrixPosition( xrMorpherSliderTrack.matrixWorld );
                sliderXAxis.set(1, 0, 0).applyQuaternion( xrMorpherSliderTrack.quaternion ).normalize();
                sliderNormal.set(0, 0, 1).applyQuaternion( xrMorpherSliderTrack.quaternion ).normalize();

                // Vector from thumb center to ray hit
                const hitOffsetVec = new THREE.Vector3().subVectors( hitPoint, thumbWorldPos );
                grabOffset = hitOffsetVec.dot( sliderXAxis ); // signed offset from center of thumb
            }  

            if ( intersections[0].object === panelHandle && intersections.length === 1 ) {
                //console.log(intersections[0]);
                console.log("UIPanelHandle selected");
                panelDragging = true;

                var tmpMat4 = new THREE.Matrix4();

                tmpMat4.identity().extractRotation(controller1.matrixWorld);
                raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
                raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat4).normalize();

                const hits = raycaster.intersectObject( panelHandle, true );
                if ( !hits.length ) return;

                hitPointWorld.copy(hits[0].point);

                 // Offset so it doesn't snap
                panelHandle.getWorldPosition(grabOffsetWorld).sub(hitPointWorld);

                // Initial distance along the ray
                dragDistance = raycaster.ray.origin.distanceTo(hitPointWorld);

                // Track controller movement
                prevCtrlPos.setFromMatrixPosition(controller1.matrixWorld);
            } 
        }
    });

    controller1.addEventListener('selectend', () => {
        selectState = false;
        xrAnimationDragging = false;
        xrMorpherDragging = false;
        panelDragging = false;
    }); 

    controller1.addEventListener('squeezestart', () => {
        xrPointer = true;
    });

    controller1.addEventListener('squeezeend', () => {
        xrPointer = false;

        let tempPointer = scene.getObjectByName( "pointer" + userName );
        if ( tempPointer )
            tempPointer.visible = false;

        // Emit remove line to the server
        socket.emit( 'lineRemove', userName );
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
    panel = new ThreeMeshUI.Block({
        width: 1.2,
        height: 2.9,
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

    // sphere "handle"
    const handleGeom = new THREE.SphereGeometry(0.06, 24, 16);
    const handleMat  = new THREE.MeshStandardMaterial({ color: 0xffffff });
    panelHandle = new THREE.Mesh(handleGeom, handleMat);
    panelHandle.name = "UIPanelHandle";
    panelHandle.userData.title = "UIPanelHandle";

    // Put it "under" the panel in local space (tune these)
    panelHandle.position.set(-1.5, 0, 0);

    // handle becomes parent of the panel
    scene.add( panelHandle );
    panelHandle.add( panel );
    panel.position.set( 0, 1.6, 0 );

    // Helper to create a label row
    function addLabelRow( text ) {
        const row = new ThreeMeshUI.Block({ width: 1.1, height: 0.08, margin: 0.01, padding: 0.01, backgroundOpacity: 1, borderRadius: 0.03, backgroundColor: new THREE.Color(0x777777) });
        row.add( new ThreeMeshUI.Text({ content: text }) );
        if ( text === 'Follow User:' ) {
            tempFollowLabel = row;
            row.name = "FollowUserLabel";
        }    
        if ( text === 'Animation Clip:' ) {
            tempAnimationLabel = row;
            row.name = "AnimationClipLabel";
        }
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
            followUser = listFollowUsers.options[ followIndex ].value;

            if ( listFollowUsers.options[ followIndex ].value === "none" ) {
                miniScreen.visible = false;
                socket.emit( 'follow', userName, "none" );  
            } else {
                if ( flags.isAnimationSync === false )
                    buttonAnimationSync.setState('selected');
    
                miniScreen.visible = true;
                socket.emit( 'getAllCamera', userName );
                socket.emit( 'follow', userName, followUser );  
            }
                

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
    morphCurrentText = new ThreeMeshUI.Text({ content: 'none' });
    const morphTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    const morphText = new ThreeMeshUI.Text({ content: 'none' });
    morphTextPanel.add( morphText );
    morphCurrentTextPanel.add( morphCurrentText );
    const buttonSelectMorph = new ThreeMeshUI.Block( buttonOptions );
    buttonSelectMorph.add( new ThreeMeshUI.Text( { content: 'next' } ));
    const buttonApplyMorph = new ThreeMeshUI.Block( buttonOptions );
    buttonApplyMorph.add( new ThreeMeshUI.Text( { content: 'apply' } ));

    const morphChannelPanel = new ThreeMeshUI.Block({ width: 1.1, height: 0.1, margin: 0.02, padding: 0.0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0, justifyContent: 'space-between' });
    const morphChannelTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    const morphChannelCurrentText = new ThreeMeshUI.Text({ content: 'none' });
    const morphOptionTextPanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.1, margin: 0.02, padding: 0.02, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    morphOptionText = new ThreeMeshUI.Text({ content: 'none' });
    morphChannelTextPanel.add( morphChannelCurrentText );
    morphOptionTextPanel.add( morphOptionText );
    const buttonSelectChannelMorph = new ThreeMeshUI.Block( buttonOptions );
    buttonSelectChannelMorph.add( new ThreeMeshUI.Text( { content: 'next' } ));
    const buttonApplyChannelMorph = new ThreeMeshUI.Block( buttonOptions );
    buttonApplyChannelMorph.add( new ThreeMeshUI.Text( { content: 'apply' } ));

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
            // Update the text
		    morphCurrentText.set( { content: morphFolder.children[ 0 ].options[ morphIndex ].value } );
            // Emit change to server
            if( flags.isMorphSync === true )
                socket.emit( 'onObjectMorphChange', userName, morphFolder.children[ 0 ].options[ morphIndex ].value );

            // Update the morph target list of the current object
            // Clear NameTargets
            morphNameTargets = [];
            // Feed the object of Morph Targets by getting the list of strings and associate the values
            if( morphFolder.children[ 0 ].options[ morphIndex ].value !== 'none' ) {
                morphNameTargets = Object.keys( model.getObjectByName( morphFolder.children[ 0 ].options[ morphIndex ].value ).morphTargetDictionary  );
                if(morphNameTargets.length > 0 ) {
                    morphOptionText.set( { content: morphNameTargets[0] } );
                    morphChannelCurrentText.set( { content: morphNameTargets[0] } );
                    // Update Slider value based on the morph value
                    xrSliderMorpherThumb.position.x = -0.5 + ( model.getObjectByName( morphCurrentText.content ).morphTargetInfluences[ morphNameTargets.indexOf( morphOptionText.content ) ] ) * 1.0;
                }
            } else {
                morphOptionText.set( { content: 'none' } );
                morphChannelCurrentText.set( { content: 'none' } );
            }

		}
	});

	buttonApplyMorph.setupState( hoveredStateAttributes );
	buttonApplyMorph.setupState( idleStateAttributes );

    buttonSelectChannelMorph.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {
            console.log("Button Select Channel Morph clicked");
            if ( morphChannelIndex < morphNameTargets.length - 1 ) 
                morphChannelIndex++;
            else 
                morphChannelIndex = 0;

            if( morphNameTargets.length === 0 ) 
                morphChannelCurrentText.set( { content: 'none' } );
            else
                morphChannelCurrentText.set( { content: morphNameTargets[ morphChannelIndex ] } ); 
		}
	});

	buttonSelectChannelMorph.setupState( hoveredStateAttributes );
	buttonSelectChannelMorph.setupState( idleStateAttributes );

    buttonApplyChannelMorph.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {
            morphOptionText.set( { content: morphNameTargets[ morphChannelIndex ] } ); 
            // Update Slider value based on the morph value
            xrSliderMorpherThumb.position.x = -0.5 + ( model.getObjectByName( morphCurrentText.content ).morphTargetInfluences[ morphNameTargets.indexOf( morphOptionText.content ) ] ) * 1.0;
		}
	});

	buttonApplyChannelMorph.setupState( hoveredStateAttributes );
	buttonApplyChannelMorph.setupState( idleStateAttributes );

    morphPanel.add( morphTextPanel, buttonSelectMorph, buttonApplyMorph );
    morphChannelPanel.add( morphChannelTextPanel, buttonSelectChannelMorph, buttonApplyChannelMorph );
    
    panel.add( morphCurrentTextPanel, morphPanel, morphOptionTextPanel, morphChannelPanel );
    objsToTest.push( buttonSelectMorph, buttonApplyMorph, buttonSelectChannelMorph, buttonApplyChannelMorph );

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

    // Create the track (static)
    xrMorpherSliderTrack = new ThreeMeshUI.Block({
        width: 1.0,
        height: 0.05,
        backgroundColor: new THREE.Color(0x222222),
        justifyContent: 'end',
        alignItems: 'end',
        borderRadius: 0.02,
        padding: 0.01,
        margin: 0.08
    });
    //sliderTrack.position.set(0, 1.5, -1.5); // Example position
    panel.add( xrMorpherSliderTrack );

    // Create the thumb (movable)
    xrSliderMorpherThumb = new ThreeMeshUI.Block({
        width: 0.04,
        height: 0.04,
        backgroundColor: new THREE.Color(0xffffff),
        justifyContent: 'center',
        borderRadius: 0.02,
    });
    // Set the thumb's initial position to be not affected by the panel's position
    xrSliderMorpherThumb.autoLayout = false;
    // Give a userData to the thumb to find it on raycaster intersection
    xrSliderMorpherThumb.userData.isSliderThumb = true;
    xrSliderMorpherThumb.userData.sliderId = 'xrSliderMorpherThumb';

    xrMorpherSliderTrack.add( xrSliderMorpherThumb );

    xrSliderMorpherThumb.position.set( -0.5, 0, 0 );

    // Create the frame counter
    const xrFrameMorpherValuePanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.12, margin: 0, padding: 0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    xrMorpherValueText = new ThreeMeshUI.Text({ content: '0.00' });
    xrFrameMorpherValuePanel.add( xrMorpherValueText );
    panel.add( xrFrameMorpherValuePanel );
  

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
            
            if( action ) 
                action.stop();

            if ( animationFolder.children[ 0 ].options[ animationIndex ].value === 'none' ) {
                action = null;
                currentClip = null;
            } else {            // Save as a global variable
                currentClip = THREE.AnimationClip.findByName( animations, animationFolder.children[ 0 ].options[ animationIndex ].value );
                action = mixer.clipAction( currentClip );
                action.clampWhenFinished = true // pause in the last keyframe
                action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat ) 
            }



            if (flags.isAnimationSync == true )
                syncStates.clip = animationFolder.children[ 0 ].options[ animationIndex ].value;
            

            socket.emit( 'onClipChange', animationFolder.children[ 0 ].options[ animationIndex ].value, flags.isAnimationSync, userName );  

            // Move Thumb to Frame
            xrSliderThumb.position.x = -0.5;
            xrFrameText.set( { content: '0001' } );



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
    buttonAnimationSync = new ThreeMeshUI.Block( buttonOptions );
    buttonAnimationSync.add( new ThreeMeshUI.Text( { content: 'on/off' } ));

	buttonAnimationSync.setupState( {
		state: 'selected',
		attributes: selectedAttributes,
		onSet: () => {
            console.log("ENTROU0")
		    flags.isAnimationSync = !flags.isAnimationSync;
            animationSyncText.set( { content: flags.isAnimationSync ? 'Sync: ON' : 'Sync: OFF' } );

            if ( action ) 
                action.paused = true;
           
            if ( flags.isAnimationSync === true ) {
                socket.emit( 'addSyncUser', userName, currentClip );

                animationCurrentText.set( { content: syncStates.clip } );
             //   animationFolder.children[ 0 ].options[ animationIndex ].value = syncStates.clip;
                

                if (syncStates.clip === 'none') {
                    action = null;
                    currentClip = null;
                    //xrSliderThumb.position.x = -0.5;
                    //xrFrameText.set( { content: '0001' } );
                } else {
                    mixer.stopAllAction();

                    currentClip = THREE.AnimationClip.findByName( animations, syncStates.clip );
                    action = mixer.clipAction( currentClip );
                    action.reset().play();
                    
                    action.clampWhenFinished = true // pause in the last keyframe
                    action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat ) 
                    
                    action.time =  Math.min( currentClip.duration, syncStates.frame / frameRate );
                    mixer.update( 0 ); // Apply the new time
                  
                    
                    action.paused = true;
                }

                // Adjust the thumb position and frame counter
                if ( arrayUsers.length > 0 ) {
                    let thumb = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + arrayUsers[0].toString() );
                    xrSliderThumb.position.x = thumb.position.x;
                    xrFrameText.set( { content: syncStates.frame.toString().padStart(4, '0') } );
                }
            } else {
                socket.emit( 'removeSyncUser', userName, currentClip );
            }

            if ( arrayUsers.length > 0 ) {
                console.log("ENTROU")
                for ( const user of arrayUsers ) {
                    console.log("ENTROU2")
                    // Hide the thumb on XR too
                    let thumbToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + user.toString() );
                    let labelToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user.toString() );

                    if ( thumbToHide ) {
                        thumbToHide.position.x = xrSliderThumb.position.x;
                        labelToHide.position.x = xrSliderThumb.position.x;
                    }

                    if ( thumbToHide && !flags.isAnimationSync ) {
                        thumbToHide.visible = true;
                        labelToHide.visible = true;
                    }
                    if ( thumbToHide && flags.isAnimationSync ) {
                        thumbToHide.visible = false;
                        labelToHide.visible = false;
                    }
                }
            }

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
                socket.emit( 'onLoopChange', animationLoop.loop, flags.isAnimationSync ); 
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
 
    // Create the track (static)
    xrAnimationSliderTrack = new ThreeMeshUI.Block({
        width: 1.0,
        height: 0.05,
        backgroundColor: new THREE.Color(0x222222),
        justifyContent: 'end',
        alignItems: 'end',
        borderRadius: 0.02,
        padding: 0.01,
        margin: 0.08
    });
    //sliderTrack.position.set(0, 1.5, -1.5); // Example position
    panel.add( xrAnimationSliderTrack );

    // Create the thumb (movable)
    xrSliderThumb = new ThreeMeshUI.Block({
        width: 0.04,
        height: 0.04,
        backgroundColor: new THREE.Color(0xffffff),
        justifyContent: 'center',
        borderRadius: 0.02,
    });
    // Set the thumb's initial position to be not affected by the panel's position
    xrSliderThumb.autoLayout = false;
    // Give a userData to the thumb to find it on raycaster intersection
    xrSliderThumb.userData.isSliderThumb = true;
    xrSliderThumb.userData.sliderId = 'xrSliderThumb';

    xrAnimationSliderTrack.add( xrSliderThumb );

    xrSliderThumb.position.set( -0.5, 0, 0 );
    
    // Create the frame counter
    const xrFramePanel = new ThreeMeshUI.Block({ width: 0.6, height: 0.12, margin: 0, padding: 0, borderRadius: 0.03, contentDirection: 'row', backgroundOpacity: 0 });
    xrFrameText = new ThreeMeshUI.Text({ content: '0001' });
    xrFramePanel.add( xrFrameText );
    panel.add( xrFramePanel );
  
    // Check who is online and create a thumb for each user 
    if ( arrayUsers.length > 0 ) {
        for ( let k = 0; k < arrayUsers.length; k++ ) 
            if ( arrayUsers[ k ] !== userName ) // Don't create a thumb for yourself
                createXRThumb( getRandomHexColor(), arrayUsers[ k ] );  
    }

    // Create Timeline UI
    // Load a glTF resource
    /* loader.load(
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
    ); */

} // End of initXR() 

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

function pickFromMiniCamera( uv ) {
  // uv = (0..1), convert to NDC (-1..1)
  const ndc = new THREE.Vector2(
    uv.x * 2 - 1,
    uv.y * 2 - 1
  );

  const raycasterMini = new THREE.Raycaster();
  raycasterMini.setFromCamera( ndc, followCamera );

  const intersects = raycasterMini.intersectObjects( meshModel, true );
  if (intersects.length > 0) {
    return intersects[0].point;
  } else 
    return raycasterMini.ray.origin.clone().add(raycasterMini.ray.direction.clone().multiplyScalar(3));
}

// Function to create multiple colored slider animation thumbs on XR panel
function createXRThumb( color, userName ) {
    // Create the thumb (movable)
    const newThumb = new ThreeMeshUI.Block({
        width: 0.04,
        height: 0.04,
        backgroundColor: new THREE.Color( color ),
        justifyContent: 'center',
        borderRadius: 0.02,
    });

    // Set a name, position and autolayout
    newThumb.name = 'xrSliderThumb' + userName;
    newThumb.autoLayout = false;
    newThumb.position.set( -0.5, 0, 0 );
    
    //Hide it by default
    newThumb.visible = false;

    xrAnimationSliderTrack.add( newThumb );

    // Create the SliderThumb Name Label
    const sliderLabel = new ThreeMeshUI.Block({
        width: 0.2,
        height: 0.05,
        justifyContent: 'center',
        alignItems: 'center',
        margin: 0.02,
    });

    sliderLabel.autoLayout = false;
    // Add text
    sliderLabel.add(new ThreeMeshUI.Text({ content: userName }));
    sliderLabel.position.y = -0.05;
    sliderLabel.position.x = -0.5;
    sliderLabel.name = 'xrSliderLabel' + userName;
    sliderLabel.visible = false;

    xrAnimationSliderTrack.add( sliderLabel );
}

function removeXRThumb( userName ) {
    const thumbName = 'xrSliderThumb' + userName;
    const thumbToRemove = xrAnimationSliderTrack.getObjectByName( thumbName );
    if ( thumbToRemove ) {
        xrAnimationSliderTrack.remove( thumbToRemove );
        console.log("Removed thumb for user:", userName);
    } else {
        console.log("Thumb not found for user:", userName);
    }
}

function loadAvatar( gltfString, userCamera, user ) {
    // Load an avatar
    loader.load(
        // resource URL
        gltfString, 
        // called when the resource is loaded
        function ( gltf ) {
            
            let model = gltf.scene;
            model.name = "avatar" + user;

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

// Render function for the main loop
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
            socket.emit( 'timelineUserFollow', userName, currentFrame, currentClip, flags.isAnimationSync );
            updateFrameNumber();
            // Update my slider user name (me)
            updateSliderValue( slider, sliderName );

            if ( session ) {
                //handle.morphTargetInfluences[ 0 ] = currentFrame/100;
            
                // Update the thumb position
                xrSliderThumb.position.x = -0.5 + ( currentFrame / ( action.getClip().duration * frameRate ) ) * 1.0;
                // Show my thumb
                let myThumb = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + userName );
                if ( myThumb ) 
                    myThumb.position.x = xrSliderThumb.position.x;
            }
        }
    }

    controls.update();

    if( session ) {
        // First, render scene from miniCamera into its texture
        if ( followUser !== "none" ) {
            
            const wasXR = renderer.xr.enabled;
            renderer.xr.enabled = false;

            // Avoid feedback loop
            miniScreen.visible = false;         

            const prevTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(miniRT);
            renderer.clear();                      // if you rely on clear
            renderer.render(scene, followCamera);
            renderer.setRenderTarget(prevTarget);

            miniScreen.visible = true;
            renderer.xr.enabled = wasXR;
        }

        renderer.render( scene, camera );
    } else {
        if ( followUser === "none" )
            renderer.render( scene, camera );
        else 
            renderer.render( scene, followCamera );
    }
   

    // Handle Raycaster for Line Pointer
    if ( isShiftDown === true && meshModel.length > 0 ) {
        // Update the picking ray with the camera and mouse position
        if ( followUser !== "none" ) {
            raycaster.setFromCamera( mouse, followCamera );
        } else {
            raycaster.setFromCamera( mouse, camera );
        }
        // Get Point B from raycaster intersection
        let pointB;
        const intersects = raycaster.intersectObjects( meshModel, true );
        
        if ( intersects.length > 0 ) {
            pointB = intersects[0].point.clone();
        } else {
            pointB = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(3));
        }
        // Get Point A from camera position
        let pointA;
        if ( followUser !== "none" ) {
            pointA = followCamera.position.clone();
        } else {
            pointA = camera.position.clone();
        }
        // Adjust pointA a bit forward
        pointA.y -= 0.15;
        pointA.x += 0.05;
        

        // Draw the local pointer
        let tempPointer = scene.getObjectByName( "pointer" + userName );
        if ( tempPointer ) {
            tempPointer.position.copy( pointB );
            tempPointer.visible = true;
        }

        // Emit the line to the server
        socket.emit( 'lineUpdate', userName, pointA, pointB );
    } 

    // XR Session to get controllers buttons
    if ( session && controller1 && controller2 ) {

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
                if ( button.pressed && previouslyPressed ){
                    //console.log("HOLD " + `${index}` )

                }
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

        // Handle XR Animation Slider when dragging
        if ( xrAnimationDragging ) {
            console.log("Dragging Animation Slider");
            const rayOrigin = new THREE.Vector3().setFromMatrixPosition( controller1.matrixWorld );
            const rayDir = new THREE.Vector3(0, 0, -1)
                .applyMatrix4( new THREE.Matrix4().extractRotation( controller1.matrixWorld ) )
                .normalize();

            const ray = new THREE.Ray( rayOrigin, rayDir );
            const sliderPlane = new THREE.Plane().setFromNormalAndCoplanarPoint( sliderNormal, sliderCenter );
            const intersectPoint = new THREE.Vector3(); 

            if ( ray.intersectPlane( sliderPlane, intersectPoint ) ) {
                const dragVec = new THREE.Vector3().subVectors( intersectPoint, sliderCenter );
                let projectedX = dragVec.dot( sliderXAxis ) - grabOffset;

                projectedX = THREE.MathUtils.clamp( projectedX, minX, maxX );
                xrSliderThumb.position.x = projectedX;

                if ( action ) {
                    if( action.isRunning() !== true ) 
                        action.play();
                    action.paused = true;

                    // Calculate and store normalized slider value
                    const normalized = (projectedX - minX) / ( maxX - minX );
                    const frame = Math.round( normalized * ( action.getClip().duration * frameRate ) );
                    
                    if(flags.isAnimationSync)
                        syncStates.frame = frame;

                    slider.value = frame; // Update slider to match animation

                    const currentFrame = parseInt( frame );
                    action.time =  Math.min( currentClip.duration, currentFrame / frameRate );
                    mixer.update( 0 ); // Apply the new time
                    updateFrameNumber();
                        
                    let progress = Math.round( action.time * frameRate );
                    // Emit value
                    socket.emit( 'grabbing', action.time, progress, flags.isAnimationSync, userName, animationFolder.children[ 0 ].controller.value.rawValue );
                } else {
                    // Calculate and store normalized slider value
                    const normalized = (projectedX - minX) / ( maxX - minX );
                    const frame = Math.round( normalized * ( slider.max - slider.min ) ) + parseInt( slider.min );
                    slider.value = frame;
                    socket.emit( 'grabbing', frame, frame, flags.isAnimationSync, userName, "none" );
                    updateFrameNumber();
                }
                
            }
        }

        // Handle XR Morpher Slider when dragging
        if ( xrMorpherDragging ) {
            const rayOrigin = new THREE.Vector3().setFromMatrixPosition( controller1.matrixWorld );
            const rayDir = new THREE.Vector3(0, 0, -1)
                .applyMatrix4( new THREE.Matrix4().extractRotation( controller1.matrixWorld ) )
                .normalize();

            const ray = new THREE.Ray( rayOrigin, rayDir );
            const sliderPlane = new THREE.Plane().setFromNormalAndCoplanarPoint( sliderNormal, sliderCenter );
            const intersectPoint = new THREE.Vector3();

            if ( ray.intersectPlane( sliderPlane, intersectPoint ) ) {
                const dragVec = new THREE.Vector3().subVectors( intersectPoint, sliderCenter );
                let projectedX = dragVec.dot( sliderXAxis ) - grabOffset;

                projectedX = THREE.MathUtils.clamp( projectedX, minX, maxX );
                xrSliderMorpherThumb.position.x = projectedX;

                const normalized = ( projectedX - minX ) / ( maxX - minX ); // → range 0.0–1.0
                xrMorpherValueText.set( { content: normalized.toFixed(2) } );

                // Emit the value to the server
                if ( morphOptionText !== null && morphOptionText.content !== 'none' ) {
                    socket.emit( 'onSliderMorphChange', userName, morphCurrentText.content, morphNameTargets.indexOf( morphOptionText.content ), normalized );
                    // Update the morph target influence on the mesh
                    scene.getObjectByName( morphCurrentText.content ).morphTargetInfluences[ morphNameTargets.indexOf( morphOptionText.content ) ] = normalized;
                }
            }
        }

        if ( panelDragging ) {
            console.log("Dragging Panel");
            //const raycaster = new THREE.Raycaster();
            var tmpMat4 = new THREE.Matrix4();

            // Controller movement since last frame
            currCtrlPos.setFromMatrixPosition(controller1.matrixWorld);
            const ctrlDelta = currCtrlPos.clone().sub(prevCtrlPos);
            
            tmpMat4.identity().extractRotation( controller1.matrixWorld );
            raycaster.ray.origin.setFromMatrixPosition( controller1.matrixWorld );
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4( tmpMat4 );

            // Project controller movement onto the ray to change distance (forward/back)
            const deltaAlongRay = ctrlDelta.dot(raycaster.ray.direction);
            dragDistance = Math.max(0.05, dragDistance + deltaAlongRay); // clamp so it can't go "behind" controller

            prevCtrlPos.copy(currCtrlPos);

            // Desired point along ray + offset
            const desiredWorld = raycaster.ray.origin
                .clone()
                .add(raycaster.ray.direction.clone().multiplyScalar(dragDistance))
                .add(grabOffsetWorld);

            // Move handle (and therefore the panel)
            panelHandle.position.copy( desiredWorld );

            //Face to Camera
            let xrCam = renderer.xr.getCamera( camera );
            xrCam.getWorldPosition( camPos );
            panelHandle.getWorldPosition( handlePos );

            lookDir.subVectors( camPos, handlePos );
            lookDir.y = 0;
            lookDir.normalize();

            panelHandle.lookAt( handlePos.clone().add(lookDir) );
        }

        if ( xrPointer ) {
            // Get controller orientation & position
            let tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation( controller1.matrixWorld );

            raycaster.ray.origin.setFromMatrixPosition( controller1.matrixWorld );
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4( tempMatrix );

            const intersects = raycaster.intersectObjects( meshModel, true );
            let pointB;
            let pointA = null;

            if ( intersects.length > 0 ) {
                if ( intersects[0].object.name === "miniScreen"){
                    const uv = intersects[ 0 ].uv; // normalized [0,1] coordinates on the plane
                    pointB = pickFromMiniCamera( uv );
                    pointA = followCamera.position.clone();
                } else
                    pointB = intersects[0].point.clone();
            } else {
                pointB = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(3));
            }

            // Get Point A from camera position
            if ( !pointA )
                pointA = camera.position.clone();

            // Draw the local pointer
            let tempPointer = scene.getObjectByName( "pointer" + userName );
            if ( tempPointer ) {
                tempPointer.position.copy( pointB );
                tempPointer.visible = true;
            }

            // Emit the line to the server
            socket.emit( 'lineUpdate', userName, pointA, pointB );
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
if (socket)
    socket.emit( 'createCamera', userName );



// ********************************************************************

// Windows Behaviour & Events *****************************************

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}

// Mouse move event
window.addEventListener( 'mousemove', ( event ) => {
    if( isShiftDown === true) {
        mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
        mouse.y = -( event.clientY / window.innerHeight ) * 2 + 1;
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') 
        isShiftDown = true;
});

window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        isShiftDown = false;
        
        let tempPointer = scene.getObjectByName( "pointer" + userName );
        if ( tempPointer )
            tempPointer.visible = false;

        // Emit remove line to the server
        socket.emit( 'lineRemove', userName );
    }   
});

// Timeline GUI *******************************************************

document.getElementById( "playPause" ).onclick = playPause;
document.getElementById( "restart" ).onclick = restart;
document.getElementById( "stop" ).onclick = stop;

function playPause() {
    if ( action ){
        // Emit play
        if( flags.isAnimationSync == true ) {
            socket.emit( 'play', animationClipObject.clip, action.time, animationFolder.children[ 1 ].controller.value.rawValue, userName );
        } else {
            // This is just for getting the data on other users when not synced
            socket.emit( 'AsyncPlay', userName );
        }
        if( action.isRunning() !== true ) {
            action.paused = false;
            action.play();
            if ( flags.isAnimationSync == true ) {
                // Save sync states
                syncStates.clip = animationClipObject.clip;
                syncStates.frame = Math.round( action.time * frameRate );
                syncStates.isPlaying = true;
            }
        }
        else{
            action.paused = true;
            if ( flags.isAnimationSync == true ) {
                // Save sync states
                syncStates.clip = animationClipObject.clip;
                syncStates.frame = Math.round( action.time * frameRate );
                syncStates.isPlaying = false;
            }
        }
    } 
}

function restart() {
    if ( action ){
        // Emit restart
        if( flags.isAnimationSync == true ) {
            socket.emit( 'restart', animationClipObject.clip, animationFolder.children[ 1 ].controller.value.rawValue, userName );
            // Save sync states
            syncStates.clip = animationClipObject.clip;
            syncStates.frame = 0;
            syncStates.isPlaying = true;
        }
        else
            socket.emit( 'AsyncRestart', userName );
        action.reset();
        action.play();
    }
}

function stop() {
    if ( action ){
        // Emit stop
        if( flags.isAnimationSync == true ) {
            socket.emit( 'stop', userName, flags.isAnimationSync );
            // Save sync states
            syncStates.clip = animationClipObject.clip;
            syncStates.frame = Math.round( action.time * frameRate );
            syncStates.isPlaying = false;
        }
        else
            socket.emit( 'AsyncStop', userName );
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

        // Save sync states
        if ( flags.isAnimationSync == true ) {
            syncStates.clip = animationFolder.children[ 0 ].controller.value.rawValue;
            syncStates.frame = progress;
            syncStates.isPlaying = false;
        }

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
        updateFrameNumber();
        socket.emit( 'grabbing', slider.value, slider.value, flags.isAnimationSync, userName, "none" );
    }
});

function updateFrameNumber() {
    let frameNumber = document.getElementById( "frameNumber" );
    let value = slider.value;
    frameNumber.textContent = value.toString().padStart(4, '0');
    // Update XR Frame Text
    if ( xrFrameText !== null )
        xrFrameText.set( { content: value.toString().padStart(4, '0') } );
}

function handleFollowUser( user ) {

    // Make sure Users are synced when following
    animationFolder.children[ 2 ].controller.value.rawValue = true;


    if( user !== "none" ){
        followUser = user;
        // Remove keyboard controls
        controls.enabled = false;
        let userCameraHelper = scene.getObjectByName( user );
        let userAvatar = scene.getObjectByName( "avatar" + user );
        socket.emit( 'follow', userName, user );  
        
        if ( userCameraHelper ) {
            // Hide it
            userCameraHelper.visible = false;
            userAvatar.visible = false;
            socket.emit( 'hide', userName, user );
            socket.emit( 'getAllCamera', userName );   
        }
    } else {
        let userCameraHelper = scene.getObjectByName( followUser );
        let userAvatar = scene.getObjectByName( "avatar" + followUser );
        socket.emit( 'follow', userName, 'none' );  

        if ( userCameraHelper ) {
            // Show it
            if (cameraHelperVisibility == true)
                userCameraHelper.visible = true;
            userAvatar.visible = true;
            socket.emit( 'unhide', userName, followUser );
        }
        followUser = user;
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

    // Create object to bind with ui options
    let animationOptions = {
        none: 'none',
    };

    listFollowUsers.on( "change", function( ev ){
        handleFollowUser( ev.value );
    });

    // Check if there is a XR Session
    const session = renderer.xr.getSession();

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
                            socket.emit( 'onObjectMorphChange', userName, ev.value );
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
                        socket.emit( 'onObjectMorphChange', userName, ev.value );
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
                            socket.emit( 'onSliderMorphChange', userName, currentObjectSelection.morphObject, morphNameTargets.indexOf( ev.target.label ), ev.value );
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
                if (flags.isAnimationSync == true ) {
                      syncStates.clip = ev.value;
                      syncStates.frame = 0;
                }

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
                if (flags.isAnimationSync == true ) {
                    syncStates.clip = ev.value;
                    syncStates.frame = 0;
                }
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
                    socket.emit( 'onLoopChange', ev.value, flags.isAnimationSync ); 
                action.setLoop( animationLoop.loop === false ? THREE.LoopOnce : THREE.LoopRepeat ) 
            }

            if( ev.target.label === "loop" && action == null ){
                if( flags.isAnimationSync == true )
                    socket.emit( 'onLoopChange', ev.value, flags.isAnimationSync ); 
            }

            if( ev.target.label === "sync" && ev.value == true){
                if ( action ) {
                    action.paused = true;
                }
                socket.emit( 'addSyncUser', userName, currentClip ); 

                // Update the Sync state into this user
                // update clip
                let tempFrame = syncStates.frame;

                // update islooping
                animationFolder.children[ 1 ].controller.value.rawValue = syncStates.isLooping;

                if( animationClipObject.clip != syncStates.clip ) {
                    console.log( syncStates.clip );
                    if (typeof syncStates.clip === 'string' ) 
                        animationFolder.children[ 0 ].controller.value.rawValue = syncStates.clip;
                    else
                        animationFolder.children[ 0 ].controller.value.rawValue = syncStates.clip.name;
            
                    if ( session )
                        animationCurrentText.set( { content: syncStates.clip } );
                }  
                // update frame action.time (DO FOR XR SESSION)
                if ( action ) {
                    if (typeof syncStates.clip === 'string' )
                        action = mixer.clipAction( THREE.AnimationClip.findByName( animations, syncStates.clip ) );
                    else
                        action = mixer.clipAction( THREE.AnimationClip.findByName( animations, syncStates.clip.name ) );
                    let frameTime = (tempFrame / frameRate);
                    action.time = frameTime;
                    mixer.update( 0 ); // Apply the new time
                    action.play();
                    action.paused = true;
                }
                // update frame slider (DO FOR XR SESSION)
                if ( document.getElementById( "myTimeline" ).value != tempFrame ) {
                    document.getElementById( "myTimeline" ).value = tempFrame;
                    updateFrameNumber();
                    updateSliderValue( slider, sliderName );
                }


                if ( arrayUsers.length > 0 && flags.isAnimationSync ){
                    for( const user of arrayUsers ){
                        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
                        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
                        if (session) {
                            // Hide the thumb on XR too
                            let thumbToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + user.toString() );
                            let labelToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user.toString() );
                            if ( thumbToHide ) {
                                thumbToHide.visible = false;
                                labelToHide.visible = false;
                            }
                        }   
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
                    // Show XR Thumb too
                    if (session) {
                        let thumbToShow = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + arrayUsers[0].toString() );
                        let labelToShow = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + arrayUsers[0].toString() );
                        if ( thumbToShow ) {
                            thumbToShow.visible = true;
                            labelToShow.visible = true;
                        }
                    }
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
                            // Hide the rest of the Thumbs on XR too
                            if (session) {
                                let thumbToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + arrayUsers[i].toString() );
                                let labelToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + arrayUsers[i].toString() );
                                if ( thumbToHide ) {
                                    thumbToHide.visible = false;
                                    labelToHide.visible = false;
                                }
                            }  
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

    cameraHelper.visible = cameraHelperVisibility;

    // Load an avatar
    loadAvatar( 'glb/avatarVr.glb', userCamera, msg );
    noXRCameraUpdate();
});

// Behavior when receives morph target new values
socket.on( 'onSliderMorphChange', function( user, object, morphTarget, value ) {
    if( flags.isMorphSync == true ){
        // Check if current Morph object is the same of the synced one
        if( currentObjectSelection.morphObject != object ){
            currentObjectSelection.morphObject = object;
        }
            
        let key = Object.keys( sliderMorphs[ morphTarget ] )
        if( sliderMorphs[ morphTarget ][ key ] !== value ){
            sliderMorphs[ morphTarget ][ key ] = value;
            pane.refresh();
            document.getElementById("myBox").textContent = user + " changed morph";
        }

        //Update XR UI if it exists
        if ( morphOptionText !== null ) {
            //Update the morph text
            morphOptionText.set( { content: Object.keys( sliderMorphs[ morphTarget ] )[ 0 ] } );
            //Update the morph value text
            xrMorpherValueText.set( { content: value.toFixed(2).toString() } );
            // Update the slider position
            xrSliderMorpherThumb.position.x = -0.5 + value * 1.0;
        }
    }
});

// Behavior when receives object morph changes
socket.on( 'onObjectMorphChange', function( user, value ) {
    if( flags.isMorphSync == true ){
        morphFolder.children[0].controller.value.rawValue = value;
        document.getElementById("myBox").textContent = user + " changed morph object";
        // Update XR UI if it exists
        if ( morphCurrentText !== null ){
            morphCurrentText.set( { content: value } );
        }
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

        // Update the status
        document.getElementById("myBox").textContent = msg + " has connected";

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

        // Create a Line Pointer for this user
        let geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(), new THREE.Vector3()
        ]);
        let lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
        let tempLine = new THREE.Line(geometry, lineMaterial);
        tempLine.name = "line" + msg;
        tempLine.visible = false;
        scene.add( tempLine );

        // Create a Round Pointer for this user
        let pointer = new THREE.Mesh(
            new THREE.SphereGeometry(pointerSize, 16, 16),             // radius ~3cm
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        pointer.name = "pointer" + msg;
        pointer.visible = true;
        tempLine.add(pointer);

        // Update XR UI 
        if (onlineUsersText !== null) {
            onlineUsersText.set( { content: arrayUsers.join(', ') } );
            createXRThumb( getRandomHexColor(), msg );
        }
    }
});

// Check existing users and add their cameras - only happens one time
socket.once( 'checkWhosOnline', function( msg ){
    console.log( 'There are ' + msg.length + ' users online' );
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
            cameraHelper.visible = cameraHelperVisibility;
            // Load an avatar
            loadAvatar( 'glb/avatarVr.glb', userCamera, msg[ k ] );
            
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

            // Update the status
            document.getElementById("myBox").textContent = msg[ k ] + " is connected";

            // Update XR UI 
            if ( onlineUsersText !== null ) {
                onlineUsersText.set( { content: arrayUsers.join(', ') } );
                createXRThumb( getRandomHexColor(), msg[ k ] );  
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

            // Create a Line Pointer for this user
            let geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(), new THREE.Vector3()
            ]);
            let lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
            let tempLine = new THREE.Line(geometry, lineMaterial);
            tempLine.name = "line" + msg[ k ].toString();
            tempLine.visible = false;
            scene.add( tempLine );

            // Create a Round Pointer for this user
            let pointer = new THREE.Mesh(
                new THREE.SphereGeometry(pointerSize, 16, 16),             // radius ~3cm
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
            );
            pointer.name = "pointer" +  msg[ k ].toString();
            pointer.visible = true;
            tempLine.add(pointer);
            
        }
        console.log('Added '+msg.length+' Cameras');
    }
});

// Behavior when a user disconnects
socket.on( 'userDisconnected', function( msg ) {
    const session = renderer.xr.getSession();

    console.log( msg + " has disconnected " );
    // remove user from list of follow
    removeFollowOption( msg );
    let tempCameraHelper = scene.getObjectByName( msg );

    // Update Status
    document.getElementById("myBox").textContent = msg + " disconnected";

    if( tempCameraHelper ){
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
        removeXRThumb( msg );
    }
    // Remove miniscreen that was being followed
    if ( session && followUser === msg ) {
        followUser = "none";
        miniScreen.visible = false;
    }
        
    // Remove Line 
    let tempLine = scene.getObjectByName( "line" + msg );
    if( tempLine ){
        scene.remove( tempLine );
        tempLine.geometry.dispose();
        tempLine.material.dispose();
    }
});

// On non XR camera change
socket.on( 'updateCamera', function( msg ){
    //let session = renderer.xr.getSession();

    let tempCameraHelper = scene.getObjectByName( msg.userName );
    if( !tempCameraHelper ) 
        return;
    tempCameraHelper.camera.position.set( msg.x, msg.y, msg.z );
    tempCameraHelper.camera.rotation.set( msg.lx, msg.ly, msg.lz );
    tempCameraHelper.camera.updateProjectionMatrix();
    tempCameraHelper.update();

    if ( followUser === msg.userName ) {
        followCamera.position.set( msg.x, msg.y, msg.z );
        followCamera.rotation.set( msg.lx, msg.ly, msg.lz );
    }
});

// Hide Camera
socket.on( 'hide', function( user, byUser ){
    if( byUser === userName ){      
        let userCameraHelper = scene.getObjectByName( user );
        let userAvatar = scene.getObjectByName( "avatar" + user );

        // Update status
        document.getElementById("myBox").textContent = user + " is following you";
        
        if ( userCameraHelper ) {
            // Hide it
            userCameraHelper.visible = false;
            userAvatar.visible = false;
        }
    }
});

// Show Camera
socket.on( 'unhide', function( user, byUser ){
    if( byUser === userName ){
        let userCameraHelper = scene.getObjectByName( user );
        let userAvatar = scene.getObjectByName( "avatar" + user );

        // Update status
        document.getElementById("myBox").textContent = user + " unfollowed you";
        
        if ( userCameraHelper ) {
            // Show it
            if (cameraHelperVisibility == true) 
                userCameraHelper.visible = true;
            userAvatar.visible = true;
            
        }
    }

});

// Get All users camera
socket.on( 'getAllCamera', function( msg ) {
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
});

// Follow user
socket.on( 'follow', function( user, followUserName ){
    console.log(user + " is following " + followUserName );
    if ( followUserName === "none" && userFollowingMe !== "none"  && tempFollowLabel ) {
        tempFollowLabel.set({ backgroundColor: new THREE.Color(0x777777).toArray() });
        tempFollowLabel.childrenTexts[0].set({ content: "Follow User:" });
        userFollowingMe = "none";
        return;
    }

    if ( followUserName === userName && tempFollowLabel ) {
        tempFollowLabel.set({ backgroundColor: new THREE.Color(0xff0000).toArray() });
        tempFollowLabel.childrenTexts[0].set({ content: user + " is following you" });
       // tempFollowLabel.text = user + " is following you";
        userFollowingMe = user;
    }
});

// On XR camera change
socket.on( 'updateXRCamera', function( msg ){
    let tempCameraHelper = scene.getObjectByName( msg.userName );
    let mycamera = tempCameraHelper.camera;

    mycamera.position.set(msg.pos.x, msg.pos.y, msg.pos.z);

    let quaternion = new THREE.Quaternion( msg.rot[ 0 ], msg.rot[ 1 ], msg.rot[ 2 ], msg.rot[ 3 ] );
    mycamera.quaternion.copy( quaternion );

    mycamera.updateProjectionMatrix();
    tempCameraHelper.update();

    if ( followUser === msg.userName ) {
        followCamera.position.set( msg.pos.x, msg.pos.y, msg.pos.z );
        followCamera.quaternion.set( msg.rot[0], msg.rot[1], msg.rot[2], msg.rot[3] );
        followCamera.updateProjectionMatrix();
    }
});  

// On clip change
socket.on( 'onClipChange', function( clip, sync, user ){
    // Check if there is a XR session
    const session = renderer.xr.getSession()

    // update global sync states
    if ( sync == true ) {
        syncStates.clip = clip;
        syncStates.frame = 0;
        syncStates.isPlaying = false;
    }

    // Update Status
    document.getElementById("myBox").textContent = user + " is at clip: " + clip;

    // Update the UI
    if( flags.isAnimationSync == true && sync == true ){
        if( animationFolder.children[ 0 ].controller.value.rawValue != clip ) 
            animationFolder.children[ 0 ].controller.value.rawValue = clip;
        if( session )
            animationCurrentText.set( { content: clip } );
    }

    // Check if it is the same clip running
    if( (currentClip && clip == currentClip.name)  || ( !currentClip && clip == "none" ) ) {

        if (session) {
            // Set the Follow User label
            tempAnimationLabel.set({ backgroundColor: new THREE.Color(0x777777).toArray() });
            tempAnimationLabel.childrenTexts[0].set({ content: "Animation Clip:" });
        }


        if( flags.isAnimationSync == true && sync == true){
            document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + user ).style.visibility = "hidden";
            // Hide XR Slider if it exists
            if (session) {
                let slider = scene.getObjectByName( "xrSliderThumb" + user );
                let label = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
                if( label ) {
                    label.visible = false;
                    label.position.x = -0.5;
                }
                if( slider ) {
                    slider.visible = false;
                    slider.position.x = -0.5;
                }
                
                xrSliderThumb.position.x = -0.5; // Reset position
            }
        }
        else{
            document.getElementById( "slider" + user.toString() ).style.visibility = "visible";
            document.getElementById( "sliderString" + user ).style.visibility = "visible";
            // Show XR Slider if it exists
            if (session) {
                let slider = scene.getObjectByName( "xrSliderThumb" + user );
                let label = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
                if( label ) {
                    label.visible = true;
                    label.position.x = -0.5;
                }
                if( slider ) {
                    slider.visible = true;
                    slider.position.x = -0.5;
                }
            }
        }

        // Prepare the Timeline
        let userFollowSlider = document.getElementById( "slider" + user.toString() );
        if (clip != "none")
            userFollowSlider.max = Math.round( currentClip.duration * frameRate );
        else
            userFollowSlider.max = 100;
        userFollowSlider.value = 1;
        updateSliderValue( userFollowSlider, document.getElementById( "sliderString" + user.toString() ) )

    } else {
        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
        // Hide XR Slider if it exists
        if (session) {
            let slider = scene.getObjectByName( "xrSliderThumb" + user );
            let label = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
            if( label ) 
                label.visible = false;
            if( slider )
                slider.visible = false;
            
            // Set the Follow User label
            tempAnimationLabel.set({ backgroundColor: new THREE.Color(0xff0000).toArray() });
            tempAnimationLabel.childrenTexts[0].set({ content: user +" is at: " + clip });
        }
    }

    // Make sure the slider is hidden when NONE is selected
    if( clip.name == "none" ){
        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
        // Hide XR Slider if it exists
        if (session) {
            let slider = scene.getObjectByName( "xrSliderThumb" + user );
            if( slider )
                slider.visible = false;
        }
    }

    // Consult who has the Same Clip or Not REVIEW THIS!!!!!!!!
    socket.emit( 'askClip', currentClip, userName, sync );     
  
}); 

// On loop change
socket.on( 'onLoopChange', function( value, sync ){

    // Update Status
    if ( sync == true ) {
        syncStates.isLooping = value;
    }

    if( flags.isAnimationSync == true ) {
        animationFolder.children[ 1 ].controller.value.rawValue = value;
        document.getElementById("myBox").textContent = "Someone changed loop";
        // Update XR UI if it exists
        if ( animationLoopText !== null )
            animationLoopText.set( { content: value ? 'Loop: ON' : 'Loop: OFF' } ); 
    }
}); 

// Play animation
socket.on( 'play', function( clip, time, loop, user){
    if( flags.isAnimationSync == true ){
        // Update status
        document.getElementById("myBox").textContent = user + " played animation";
        
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
socket.on( 'timelineUserFollow', function( user, currentFrame, clip, sync ){
    // Check if there is a XR session
    const session = renderer.xr.getSession()

    if ( sync == true ) {
        syncStates.clip = clip;
        syncStates.frame = currentFrame;
        syncStates.isPlaying = true;
    }

    if( currentClip && clip.name == currentClip.name ){
        // Update status
        document.getElementById("myBox").textContent = user + " played animation";

        // Get the sliders
        let slider = document.getElementById( "slider" + user.toString() );
        let sliderValue = document.getElementById( "sliderString" + user.toString() );
       
        // Initialize position
        slider.value = currentFrame;
        updateSliderValue( slider, sliderValue ); 

        if( session ){
            //  let normalized = currentFrame / ( currentClip.duration * frameRate );
            let slider = scene.getObjectByName( "xrSliderThumb" + user );
            if( slider )
                slider.position.x = -0.5 + ( currentFrame / ( action.getClip().duration * frameRate ) ) * 1.0;

            // Move my label thumb
            let myThumb = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
            if ( myThumb ) 
                myThumb.position.x = slider.position.x;
        }
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
socket.on( 'stop', function( sync ){
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

// Line creation and updates
socket.on( 'lineUpdate', function( user, pointA, pointB ){
    
    let tempLine = scene.getObjectByName( "line" + user );
    let tempPointer = tempLine.getObjectByName( "pointer" + user );

    if( tempLine ){
        console.log( "Line update from " + user );
        tempLine.geometry.setFromPoints( [ pointA, pointB ] );
        tempPointer.position.set( pointB.x, pointB.y, pointB.z );
        tempLine.visible = true;
    }
});

// Line remove
socket.on( 'lineRemove', function( user ){
    
    let tempLine = scene.getObjectByName( "line" + user );

    if( tempLine ){
        console.log( "Line remove " + user );
        tempLine.visible = false;
    }
});

// Update Sliders
socket.on( 'askClip', function( clip, user, sync ){
    // Check if there is a XR session
    const session = renderer.xr.getSession()

    // Check if it is the same clip running
    if( ( currentClip && clip && clip.name == currentClip.name ) || ( clip == currentClip ) ) {
        if (session) {
            // Set the Follow User label
            tempAnimationLabel.set({ backgroundColor: new THREE.Color(0x777777).toArray() });
            tempAnimationLabel.childrenTexts[0].set({ content: "Animation Clip:" });
        }


        if( flags.isAnimationSync == true && sync == true && arrayUsers.length > 0){
            document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
            // Hide XR Slider if it exists
            if (session) {
                let slider = scene.getObjectByName( "xrSliderThumb" + user );
                let label = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
                if( label ) 
                    label.visible = false;
                if( slider )
                    slider.visible = false;
            }
        }
        else{
            console.log("SHOW SLIDER FOR " + user);
            document.getElementById( "slider" + user.toString() ).style.visibility = "visible";
            document.getElementById( "sliderString" + user.toString() ).style.visibility = "visible";
            // Show XR Slider if it exists
            if (session) {
                let label = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
                if( label ) 
                    label.visible = true;
                let slider = scene.getObjectByName( "xrSliderThumb" + user );
                if( slider )
                    slider.visible = true;
            }
        }
        
        // Prepare the Timeline
        let userFollowSlider = document.getElementById( "slider" + user.toString() );
        if (currentClip != null ) 
            userFollowSlider.max = Math.round( currentClip.duration * frameRate );
        else
            userFollowSlider.max = 100;
        updateSliderValue( userFollowSlider, document.getElementById( "sliderString" + user.toString() ) ); 
        //userFollowSlider.value = 1;

    } else {



        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
        // Hide XR Slider if it exists
        if (session) {
            // Set the Follow User label
            tempAnimationLabel.set({ backgroundColor: new THREE.Color(0xff0000).toArray() });
            if (clip)
                tempAnimationLabel.childrenTexts[0].set({ content: user + " is at " + clip.name });
            else
                tempAnimationLabel.childrenTexts[0].set({ content: user + " is at none" });

            let slider = scene.getObjectByName( "xrSliderThumb" + user );
            let label = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
            if( label ) 
                label.visible = false;
            if( slider )
                slider.visible = false;
        }
    }

    // Make sure the slider is hidden when NONE is selected
    if( !clip || clip.name == "none" ){
     //   document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
     //   document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
        // Hide XR Slider if it exists
        if (session) {
            let slider = scene.getObjectByName( "xrSliderThumb" + user );
            if( slider )
                slider.visible = false;
        }
    }
});

// Add Sync User
socket.on( 'addSyncUser', function( user, clip ){
    arrayUsers.push( user );
    // Check if there is a XR session
    const session = renderer.xr.getSession()
    if (action)
        action.paused = true;

    if( (currentClip && clip && clip.name == currentClip.name) || !clip ) {
        if( flags.isAnimationSync ) {
            document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
            // Hide the thumb on XR too
            if ( session ) {
                let thumbToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + user.toString() );
                let labelToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user.toString() );
                if ( thumbToHide ) {
                    thumbToHide.visible = false;
                    labelToHide.visible = false;
                }
            }
            // Print the names on the slider
            document.getElementById( "sliderString" ).innerHTML = [ ...arrayUsers, "me" ].join( '<br>' );
        } else {
            if( arrayUsers.length > 1 ) {
                document.getElementById( "sliderString" + arrayUsers[ arrayUsers.length-1 ].toString() ).innerHTML = [ ...arrayUsers ].join( '<br>' );
                for( let i = 0; i < arrayUsers.length-1; i++ ){
                    //console.log(arrayUsers[ i ])
                    document.getElementById( "slider" + arrayUsers[ i ].toString() ).style.visibility = "hidden";
                    document.getElementById( "sliderString" + arrayUsers[ i ].toString() ).style.visibility = "hidden";
                    // Hide the thumb on XR too
                    if ( session ) {
                        let thumbToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + arrayUsers[ i ].toString() );
                        let labelToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + arrayUsers[ i ].toString() );
                        if ( thumbToHide ) {
                            thumbToHide.visible = false;  
                            labelToHide.visible = false;
                        }
                    }

                }
            }
        }
    } else {
        if( flags.isAnimationSync ) {
            document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
            // Hide the thumb on XR too
            if ( session ) {
                let thumbToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + user.toString() );
                let labelToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user.toString() );
                if ( thumbToHide ) {
                    thumbToHide.visible = false;
                    labelToHide.visible = false;
                }
            }
            // Print the names on the slider
            document.getElementById( "sliderString" ).innerHTML = [ ...arrayUsers, "me" ].join( '<br>' );
        } 
    }
});

// Remove Sync User
socket.on( 'removeSyncUser', function( user, clip ){
    // Check if there is a XR session
    const session = renderer.xr.getSession()

    // Remove user from list of users synced if he/she is there
    const index = arrayUsers.indexOf( user );
    if ( index !== -1 ) 
        arrayUsers.splice( index, 1 );

    if ( (currentClip && clip && clip.name == currentClip.name ) || !clip ) {
        document.getElementById( "slider" + user.toString() ).style.visibility = "visible";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "visible";
        document.getElementById( "sliderString" + user.toString() ).innerHTML = user.toString();
        document.getElementById( "slider" + user.toString() ).value = slider.value;
        updateSliderValue( document.getElementById( "slider" + user.toString() ), document.getElementById( "sliderString" + user.toString() ) ); 
        // Show the thumb on XR too
        if (session) {
            let thumbToShow = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + user.toString() );
            let labelToShow = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user.toString() );
            
            if ( flags.isAnimationSync ) {
                thumbToShow.position.x = xrSliderThumb.position.x;
                labelToShow.position.x = xrSliderThumb.position.x;
            }
          
            
            if ( thumbToShow ) {
                thumbToShow.visible = true;
                labelToShow.visible = true;
            }
        }
    }
    else {
        document.getElementById( "slider" + user.toString() ).style.visibility = "hidden";
        document.getElementById( "sliderString" + user.toString() ).style.visibility = "hidden";
        // Hide the thumb on XR too
        if (session) {
            let thumbToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + user.toString() );
            let labelToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user.toString() );
            if ( thumbToHide ) {
                thumbToHide.visible = false;
                labelToHide.visible = false;
            }
        }
    }

    if( arrayUsers.length > 1 && arrayUsers.length != 1) {
        for(let i = 1; i<arrayUsers.length; i++){
             // Hide
            document.getElementById( "slider" + arrayUsers[i].toString() ).style.visibility = "hidden";
            document.getElementById( "sliderString" + arrayUsers[i].toString() ).style.visibility = "hidden";
            // Hide the rest of the Thumbs on XR too
            if (session) {
                let thumbToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + arrayUsers[i].toString() );
                let labelToHide = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + arrayUsers[i].toString() );
                if ( thumbToHide ) {
                    thumbToHide.visible = false;
                    labelToHide.visible = false;
                }
            }
        }
    }

    if( arrayUsers.length == 1 && !flags.isAnimationSync && currentClip && clip && clip.name == currentClip.name ) {
        document.getElementById( "slider" + arrayUsers[ 0 ].toString() ).style.visibility = "visible";
        document.getElementById( "sliderString" + arrayUsers[ 0 ].toString() ).style.visibility = "visible";
        // Show the thumb on XR too
        if (session) {
            let thumbToShow = xrAnimationSliderTrack.getObjectByName( 'xrSliderThumb' + arrayUsers[ 0 ].toString() );
            let labelToShow = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + arrayUsers[ 0 ].toString() );
            if ( thumbToShow ) {
                thumbToShow.visible = true;
                labelToShow.visible = true;
            }
        }
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
    // Save sync states
    if ( sync == true ) { 
        syncStates.clip = clip;
        syncStates.frame = progress;
        syncStates.isPlaying = false;
    }

    // Update status
    document.getElementById("myBox").textContent = user + " grabbing animation " + clip;

    if ( clip == "none" ) {
        if (sync == true ) {
            syncStates.clip = "none";
            syncStates.frame = value;
            if (flags.isAnimationSync ) {
                slider.value = value;
                updateSliderValue( slider, sliderName );
                updateFrameNumber();
            }
            if (session) {
                // Update the thumb position
                xrSliderThumb.position.x = value / 100 - 0.5;
            }
        }
    }

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
                //handle.morphTargetInfluences[ 0 ] = progress/100;

                // Update the thumb position
                xrSliderThumb.position.x = -0.5 + ( progress / ( action.getClip().duration * frameRate ) ) * 1.0;
                // Move my Label thumb
                let myThumb = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
                if ( myThumb ) 
                    myThumb.position.x = xrSliderThumb.position.x;
            }
                          
            // Update local slider name (me) 
            updateSliderValue( slider, sliderName );
            updateFrameNumber();

            // Update all synced
            if( arrayUsers.length > 0 ){
                for( let i=0; i<arrayUsers.length; i++ ){
                    // Get the sliders from others
                    let sliderTemp = document.getElementById( "slider" + arrayUsers[ i ].toString() );
                    let sliderValueTemp = document.getElementById( "sliderString" + arrayUsers[ i ].toString() );
                    
                    sliderTemp.value = progress; // Update slider to match animation
                    updateSliderValue( sliderTemp, sliderValueTemp );
                }
            }
        }
    }

    if( (currentClip && clip && clip == currentClip.name) || (clip == "none" && currentClip == null) ){
        
         // Get the sliders from others
         let sliderTemp = document.getElementById( "slider" + user.toString() );
         let sliderValueTemp = document.getElementById( "sliderString" + user.toString() );
         
         sliderTemp.value = progress; // Update slider to match animation
         updateSliderValue( sliderTemp, sliderValueTemp );

        // Update XR Thumb UI from others if they exist in XR environment
        if ( session ) {
            let slider = scene.getObjectByName( "xrSliderThumb" + user.toString() );
            if( slider )
                if ( action )
                    slider.position.x = -0.5 + ( progress / ( action.getClip().duration * frameRate ) ) * 1.0;
                else
                    slider.position.x = -0.5 + ( progress / ( 100 * frameRate ) ) * 1.0;
            // Move my label thumb
            let myThumb = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + user );
            if ( myThumb ) 
                myThumb.position.x = slider.position.x;
        }

        if( arrayUsers.length > 1 ){
            for( let i=0; i<arrayUsers.length; i++ ){
                
                // Get the sliders from others
                let sliderTemp = document.getElementById( "slider" + arrayUsers[ i ].toString() );
                let sliderValueTemp = document.getElementById( "sliderString" + arrayUsers[ i ].toString() );
                
                sliderTemp.value = progress; // Update slider to match animation
                updateSliderValue( sliderTemp, sliderValueTemp );
                
                // Update XR Thumb UI from others if they exist in XR environment
                if ( session ) {
                    let slider = scene.getObjectByName( "xrSliderThumb" + arrayUsers[ i ].toString() );
                    if( slider )
                        slider.position.x = -0.5 + ( progress / ( action.getClip().duration * frameRate ) ) * 1.0;
                    // Show my thumb
                    let myThumb = xrAnimationSliderTrack.getObjectByName( 'xrSliderLabel' + arrayUsers[ i ].toString() );
                    if ( myThumb ) 
                        myThumb.position.x = slider.position.x;
                }
            }
        }
    }

});