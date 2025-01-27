import React from 'react';
import ReactDOM from 'react-dom';
import NavigationButton, {getIconFromInteraction} from "../../Shared/NavigationButton";
import {H5PContext} from '../../../context/H5PContext';
import ContextMenu from "../../Shared/ContextMenu";
import loading from '../../../assets/loading.svg';
import './ThreeSixtyScene.scss';

export const sceneRenderingQualityMapping = {
  high: 128,
  medium: 64,
  low: 16,
};

export default class ThreeSixtyScene extends React.Component {
  constructor(props) {
    super(props);

    this.sceneRef = React.createRef();
    this.renderedInteractions = 0;
    this.initializeScene = this.initializeScene.bind(this);

    this.state = {
      hasInitialized: false,
      pointerLockElement: null,
      willPointerLock: false,
      hasPointerLock: false,
      isWaitingForNextScene: false,
    };
  }

  initializePointerLock(element) {
    // Not supported
    element.requestPointerLock = element.requestPointerLock
      || element.mozRequestPointerLock;
    if (!element.requestPointerLock) {
      return;
    }

    // Already queued
    if (this.pointerLockTimeout && this.pointerLockTimeout.current) {
      return;
    }

    this.setState({
      willPointerLock: true,
      pointerLockElement: element,
    });

    this.pointerLockTimeout = setTimeout(() => {
      this.setState({
        hasPointerLock: true,
      });
    }, 100);
  }

  cancelPointerLock() {
    this.setState({
      willPointerLock: false,
      hasPointerLock: false,
    })
  }

  /**
   *
   */
  initializeScene() {
    const startPosition = this.props.sceneParams.cameraStartPosition
      .split(',')
      .map(parseFloat);

    const yaw = startPosition[0];
    const pitch = startPosition[1];

    this.scene = new H5P.ThreeSixty(this.imageElement, {
      ratio: 16/9,
      cameraStartPosition: {
        yaw: yaw,
        pitch: pitch,
      },
      segments: sceneRenderingQualityMapping[this.context.sceneRenderingQuality],
    }, () => {
      // Determine if image source has changed
      if (this.props.sceneWaitingForLoad !== null && this.props.isActive) {
        this.props.doneLoadingNextScene();
      }

      let path = H5P.getPath(this.props.imageSrc.path, this.context.contentId);
      if (this.imageElement.crossOrigin !== null && H5P.addQueryParameter && H5PIntegration.crossoriginCacheBuster) {
        path = H5P.addQueryParameter(path, H5PIntegration.crossoriginCacheBuster);
      }

      const hasChangedImage = (path !== this.imageElement.src);

      if (hasChangedImage) {
        this.imageElement.src = path;
      }

      return hasChangedImage;
    });

    this.scene.setAriaLabel(this.props.sceneParams.scenename);

    if (this.props.isActive) {
      this.sceneRef.current.appendChild(this.scene.getElement());
      this.scene.resize();
      this.scene.startRendering();
    }

    this.context.on('doubleClickedInteraction', () => {
      this.cancelPointerLock();
    });

    this.scene.on('movestart', (e) => {
      if (!this.context.extras.isEditor || e.data.isCamera) {
        return;
      }

      const target = e.data.target;
      if (target) {
        // Don't move when dragging context menu
        if (target.classList.contains('context-menu')) {
          e.defaultPrevented = true;
          return false;
        }

        // Don't move when dragging context menu children
        if (target.parentNode) {
          const parent = target.parentNode;
          if (parent.classList.contains('context-menu')) {
            e.defaultPrevented = true;
            return false;
          }
        }
      }

      // Make sure we don't start movement on contextmenu actions
      if (!target || !target.classList.contains('nav-button')) {
        return;
      }

      const element = e.data.element;
      this.initializePointerLock(element);
    });

    this.scene.on('movestop', e => {
      if (this.context.extras.isEditor) {
        this.cancelPointerLock();
      }
      this.context.trigger('movestop', e.data);
    });

    this.props.addScene(this.scene, this.props.sceneParams.sceneId);

    // Add buttons to scene
    this.addInteractionHotspots(this.props.sceneParams.interactions);

    this.setState({
      hasInitialized: true,
    });
    this.imageElement.removeEventListener('load', this.initializeScene);
  }

  loadScene() {
    this.imageElement = document.createElement('img');
    this.imageElement.addEventListener('load', this.initializeScene);

    if (H5P.setSource !== undefined) {
      H5P.setSource(this.imageElement, this.props.imageSrc, this.context.contentId)
    }
    else {
      const path = H5P.getPath(this.props.imageSrc.path, this.context.contentId);
      if (H5P.getCrossOrigin !== undefined) {
        const crossorigin = H5P.getCrossOrigin(path);
        if (crossorigin) {
          this.imageElement.setAttribute('crossorigin', crossorigin);
        }
      }
      this.imageElement.src = path;
    }
  }

  /**
   * Create, add and render all interactions in the 3D world.
   *
   * @param {Array} interactions
   */
  addInteractionHotspots(interactions) {
    if (!interactions) {
      return;
    }

    const list = interactions.map(this.createInteraction);
    this.renderedInteractions = list.length;

    ReactDOM.render(
      <H5PContext.Provider value={this.context}>
        { list }
      </H5PContext.Provider>,
      this.scene.getCameraElement()
    );
  }

  /**
   * Creates a button for each interaction
   *
   * @param {Object} interaction
   * @param {number} index
   * @return {NavigationButton}
   */
  createInteraction = (interaction, index) => {

    const className = ['three-sixty'];
    if (this.props.audioIsPlaying === 'interaction-' + this.props.sceneId + '-' + index) {
      className.push('active');
    }

    let title = interaction.action.metadata.title;
    const isGoToSceneInteraction = interaction.action.library.split(' ')[0] === 'H5P.GoToScene';
    if (isGoToSceneInteraction) {
      const gotoScene = this.context.params.scenes.find(scene => {
        return scene.sceneId === interaction.action.params.nextSceneId;
      });
      title = gotoScene.scenename; // Use scenename as title.
    }

    return (
      <NavigationButton
        key={'interaction-' + index}
        onMount={ el => this.scene.add(
          el,
          ThreeSixtyScene.getPositionFromString(interaction.interactionpos),
          this.context.extras.isEditor
        )}
        onUnmount={ el => this.scene.remove(this.scene.find(el)) }
        onUpdate={ el => H5P.ThreeSixty.setElementPosition(
          this.scene.find(el),
          ThreeSixtyScene.getPositionFromString(interaction.interactionpos)
        )}
        title={title}
        buttonClasses={ className }
        icon={getIconFromInteraction(interaction, this.context.params.scenes)}
        isHiddenBehindOverlay={ this.props.isHiddenBehindOverlay }
        nextFocus={ this.props.nextFocus }
        type={ 'interaction-' + index }
        clickHandler={this.props.showInteraction.bind(this, index)}
        doubleClickHandler={() => {
          this.context.trigger('doubleClickedInteraction', index);
        }}
        onFocus={ () => { this.handleInteractionFocus(interaction) } }
        onFocusedInteraction={this.props.onFocusedInteraction.bind(this, index)}
        onBlur={this.props.onBlurInteraction}
        isFocused={this.props.focusedInteraction === index}
      >
        {
          this.context.extras.isEditor &&
          <ContextMenu
            isGoToScene={isGoToSceneInteraction}
            interactionIndex={index}
          />
        }
      </NavigationButton>
    );
  }

  /**
   * Convert params position string.
   * TODO: Use object in params instead of convert all the time.
   *
   * @param {string} position
   * @return {Object} yaw, pitch
   */
  static getPositionFromString(position) {
    position = position.split(',');
    return {
      yaw: position[0],
      pitch: position[1]
    };
  }

  /**
   * Handle interaction focused.
   *
   * @param {Object} interaction
   */
  handleInteractionFocus = (interaction) => {
    this.props.onSetCameraPos(interaction.interactionpos);
  }

  /**
   * React -
   */
  componentDidMount() {
    // Already initialized
    if (this.state.hasInitialized) {
      return;
    }

    this.loadScene();
  }

  /**
   * React -
   */
  componentDidUpdate(prevProps) {
    if (!this.state.hasInitialized) {
      return;
    }

    const isDoneLoading = this.props.sceneWaitingForLoad === null;
    if (this.state.isWaitingForNextScene && isDoneLoading) {
      // Done loading next scene
      this.setState({
        isWaitingForNextScene: false,
      });
      this.scene.stopRendering();
    }

    if (this.state.hasPointerLock) {

      if (!this.state.willPointerLock) {
        // canceled
        this.setState({
          willPointerLock: false,
          hasPointerLock: false,
        });
      }
      else {
        this.state.pointerLockElement.requestPointerLock();
        this.state.pointerLockElement.classList.add('dragging');
      }
    }
    else {
      document.exitPointerLock = document.exitPointerLock
        || document.mozExitPointerLock;
      if (document.exitPointerLock) {
        if (this.state.pointerLockElement) {
          this.state.pointerLockElement.classList.remove('dragging');
        }
        document.exitPointerLock();
      }
    }

    // Need to respond to dialog toggling in order to hide the buttons under the overlay
    const isHiddenBehindOverlayHasChanged = (this.props.isHiddenBehindOverlay !== prevProps.isHiddenBehindOverlay);
    if (isHiddenBehindOverlayHasChanged) {
      // TODO: Update scene element
      this.scene.setTabIndex(false);
    }

    // Need to respond to audio in order to update the icon of the interaction
    const audioHasChanged = (prevProps.audioIsPlaying !== this.props.audioIsPlaying);
    const hasChangedFocus = prevProps.focusedInteraction
      !== this.props.focusedInteraction;

    const hasChangedInteractions = this.props.sceneParams.interactions
      && (this.renderedInteractions
        !== this.props.sceneParams.interactions.length);
    const hasChangedVisibility = prevProps.isActive !== this.props.isActive;

    let shouldUpdateInteractionHotspots = hasChangedInteractions
        || audioHasChanged
        || hasChangedFocus
        || isHiddenBehindOverlayHasChanged;

    // Check if the scene that interactions point to has changed icon type
    // This is only relevant when changing the icon using the H5P editor
    if (window.H5PEditor && !shouldUpdateInteractionHotspots && this.props.sceneParams.interactions) {
      shouldUpdateInteractionHotspots = this.props.sceneParams.interactions.some((interaction) => {
        const library = H5P.libraryFromString(interaction.action.library);
        const machineName = library.machineName;
        if (machineName === 'H5P.GoToScene') {
          const nextSceneId = interaction.action.params.nextSceneId;
          const nextSceneIcon = this.props.sceneIcons.find(scene => {
            return scene.id === nextSceneId;
          });
          const oldNextSceneIcon = prevProps.sceneIcons.find(scene => {
            return scene.id === nextSceneId;
          });

          const hasChangedIcon = nextSceneIcon
            && oldNextSceneIcon
            && nextSceneIcon.iconType !== oldNextSceneIcon.iconType;
          if (hasChangedIcon) {
            return true;
          }
        }
        return false;
      });
    }

    if (shouldUpdateInteractionHotspots) {
      this.addInteractionHotspots(this.props.sceneParams.interactions);

      if (!hasChangedVisibility) {
        return;
      }
    }

    // Check if active state was transitioned
    if (!hasChangedVisibility) {
      return;
    }

    // Toggle activity for scene
    if (this.props.isActive) {
      // Asynchronously update the DOM so that it's not blocking rendering
      // of load screen
      setTimeout(() => {
        if (this.sceneRef.current) {
          while (this.sceneRef.current.firstChild) {
            this.sceneRef.current.removeChild(this.sceneRef.current.firstChild);
          }
        }
        this.sceneRef.current.appendChild(this.scene.element);
        this.scene.resize(this.context.getRatio());
        this.scene.startRendering();
        if (!prevProps.isActive) {
          this.scene.focus();
        }
      }, 0);
    }
    else {
      this.setState({
        isWaitingForNextScene: true,
      });
    }
  }

  /**
   * React -
   */
  render() {
    const isLoadingNextScene = this.props.sceneId
      === this.props.sceneWaitingForLoad;
    if (!this.props.isActive && !isLoadingNextScene) {
      return null;
    }

    const loadingOverlayClasses = ['loading-overlay'];
    if (!this.state.hasInitialized) {
      loadingOverlayClasses.push('no-opacity');
    }

    return (
      <div className='three-sixty-scene-wrapper'>
        <div
          ref={this.sceneRef}
          aria-hidden={ this.props.isHiddenBehindOverlay ? true : undefined }
        />
        {
          (!this.state.hasInitialized || isLoadingNextScene) &&
          <div className={loadingOverlayClasses.join(' ')}>
            <div className='loading-wrapper'>
              <div className='loading-image-wrapper'>
                <img src={loading} alt='loading' />
              </div>
              <div className='loader'>Loading background image...</div>
            </div>
          </div>
        }
      </div>
    );
  }
}

ThreeSixtyScene.contextType = H5PContext;
