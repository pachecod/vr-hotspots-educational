/**
 * A-Frame 3D asset preview controls (ported from WebXRide FileList).
 * Used by common-assets-3d-preview.html
 */
(function () {
  if (typeof AFRAME === 'undefined') return;

  AFRAME.registerComponent('enhanced-model-handler', {
    init: function () {
      this.el.addEventListener('model-loaded', this.onModelLoaded.bind(this));
      this.el.addEventListener('model-error', this.onModelError.bind(this));
    },

    onModelLoaded: function () {
      const mesh = this.el.getObject3D('mesh');
      if (mesh) this.optimizeModel(mesh);
    },

    onModelError: function (event) {
      console.error('3D preview model error:', event.detail);
    },

    optimizeModel: function (mesh) {
      if (mesh && mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
      }
      mesh.traverse((node) => {
        if (node && node.isMesh) {
          if (node.geometry) {
            node.geometry.computeBoundingBox();
            node.geometry.computeBoundingSphere();
          }
          if (node.material) {
            node.material.needsUpdate = true;
            if (node.material.map) node.material.map.needsUpdate = true;
          }
        }
      });
    },
  });

  AFRAME.registerComponent('enhanced-camera-controls', {
    init: function () {
      this.camera = this.el;
      this.initialPosition = { ...this.camera.getAttribute('position') };
      this.initialRotation = { ...this.camera.getAttribute('rotation') };
      this.lockPosition = null;
      this.moveSpeed = 0.05;
      this.movementMode = 'move';
      this.isMouseDown = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.touchState = { active: false, touches: [], lastPinchDist: null };

      this.setupKeyboardControls();
      this.setupMouseControls();
      this.setupMouseWheel();
      this.setupTouchControls();
      this.setupMessages();
    },

    setupMessages: function () {
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || !data.type) return;
        if (data.type === 'MOVEMENT_MODE_CHANGE') {
          this.movementMode = data.mode === 'look' ? 'look' : 'move';
          if (this.movementMode === 'look') {
            this.lockPosition = { ...this.camera.getAttribute('position') };
          }
        }
        if (data.type === '3D_CONTROL' && data.control === 'reset-view') {
          this.resetView();
        }
      });
    },

    setupKeyboardControls: function () {
      this._onKeyDown = (event) => {
        if (this.movementMode !== 'move') {
          if (event.key.toLowerCase() === 'r') this.resetView();
          return;
        }
        switch (event.key.toLowerCase()) {
          case 'w':
            this.moveCamera('forward', this.moveSpeed);
            break;
          case 's':
            this.moveCamera('backward', this.moveSpeed);
            break;
          case 'a':
            this.moveCamera('left', this.moveSpeed);
            break;
          case 'd':
            this.moveCamera('right', this.moveSpeed);
            break;
          case ' ':
            event.preventDefault();
            this.moveCamera('up', this.moveSpeed);
            break;
          case 'control':
            this.moveCamera('down', this.moveSpeed);
            break;
          case 'arrowup':
            this.moveCamera('up', this.moveSpeed);
            break;
          case 'arrowdown':
            this.moveCamera('down', this.moveSpeed);
            break;
          case 'arrowleft':
            this.moveCamera('left', this.moveSpeed);
            break;
          case 'arrowright':
            this.moveCamera('right', this.moveSpeed);
            break;
          case 'r':
            this.resetView();
            break;
          case 'shift':
            this.moveSpeed = 0.1;
            break;
        }
      };
      this._onKeyUp = (event) => {
        if (event.key.toLowerCase() === 'shift') this.moveSpeed = 0.05;
      };
      document.addEventListener('keydown', this._onKeyDown);
      document.addEventListener('keyup', this._onKeyUp);
    },

    setupMouseControls: function () {
      this._onMouseDown = (event) => {
        this.isMouseDown = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
      };
      this._onMouseUp = () => {
        this.isMouseDown = false;
      };
      this._onMouseMove = (event) => {
        if (!this.isMouseDown) return;
        const deltaX = event.clientX - this.lastMouseX;
        const deltaY = event.clientY - this.lastMouseY;
        this.applyDrag(deltaX, deltaY);
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
      };
      document.addEventListener('mousedown', this._onMouseDown);
      document.addEventListener('mouseup', this._onMouseUp);
      document.addEventListener('mousemove', this._onMouseMove);
    },

    setupMouseWheel: function () {
      this._onWheel = (event) => {
        event.preventDefault();
        if (this.movementMode !== 'move') return;
        const delta = event.deltaY > 0 ? 1 : -1;
        this.zoomCamera(delta * 0.5);
      };
      document.addEventListener('wheel', this._onWheel, { passive: false });
    },

    setupTouchControls: function () {
      this._onTouchStart = (event) => {
        this.touchState.touches = Array.from(event.touches);
        if (event.touches.length === 2) {
          this.touchState.lastPinchDist = this.getPinchDistance(event.touches);
        }
      };
      this._onTouchMove = (event) => {
        event.preventDefault();
        if (event.touches.length === 1 && this.touchState.touches.length === 1) {
          const deltaX = event.touches[0].clientX - this.touchState.touches[0].clientX;
          const deltaY = event.touches[0].clientY - this.touchState.touches[0].clientY;
          const prevMode = this.movementMode;
          this.movementMode = 'look';
          this.applyDrag(deltaX, deltaY);
          this.movementMode = prevMode;
        } else if (event.touches.length === 2) {
          const dist = this.getPinchDistance(event.touches);
          if (this.touchState.lastPinchDist != null) {
            const delta = (this.touchState.lastPinchDist - dist) * 0.01;
            this.zoomCamera(delta);
          }
          this.touchState.lastPinchDist = dist;
        }
        this.touchState.touches = Array.from(event.touches);
      };
      this._onTouchEnd = () => {
        this.touchState.touches = [];
        this.touchState.lastPinchDist = null;
      };
      document.addEventListener('touchstart', this._onTouchStart, { passive: true });
      document.addEventListener('touchmove', this._onTouchMove, { passive: false });
      document.addEventListener('touchend', this._onTouchEnd);
      document.addEventListener('touchcancel', this._onTouchEnd);
    },

    getPinchDistance: function (touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },

    applyDrag: function (deltaX, deltaY) {
      if (this.movementMode === 'look') {
        const rotation = this.camera.getAttribute('rotation');
        this.camera.setAttribute('rotation', {
          x: Math.max(-90, Math.min(90, rotation.x - deltaY * 0.5)),
          y: rotation.y + deltaX * 0.5,
          z: rotation.z,
        });
      } else {
        const position = this.camera.getAttribute('position');
        const rotation = this.camera.getAttribute('rotation');
        const radY = (rotation.y * Math.PI) / 180;
        const radX = (rotation.x * Math.PI) / 180;
        const moveX = -deltaX * 0.005;
        const moveZ = -deltaY * 0.005;
        this.camera.setAttribute('position', {
          x: position.x + (moveX * Math.cos(radY) - moveZ * Math.sin(radY)),
          y: position.y + moveZ * Math.cos(radX),
          z: position.z + (moveX * Math.sin(radY) + moveZ * Math.cos(radY)),
        });
      }
    },

    zoomCamera: function (amount) {
      const position = this.camera.getAttribute('position');
      const rotation = this.camera.getAttribute('rotation');
      const radY = (rotation.y * Math.PI) / 180;
      const radX = (rotation.x * Math.PI) / 180;
      const zoomDirection = {
        x: Math.sin(radY) * Math.cos(radX),
        y: -Math.sin(radX),
        z: Math.cos(radY) * Math.cos(radX),
      };
      this.camera.setAttribute('position', {
        x: position.x + zoomDirection.x * amount,
        y: position.y + zoomDirection.y * amount,
        z: position.z + zoomDirection.z * amount,
      });
    },

    moveCamera: function (direction, distance) {
      const position = this.camera.getAttribute('position');
      const rotation = this.camera.getAttribute('rotation');
      const radY = (rotation.y * Math.PI) / 180;
      const newPosition = { ...position };

      switch (direction) {
        case 'forward':
          newPosition.x -= Math.sin(radY) * distance;
          newPosition.z -= Math.cos(radY) * distance;
          break;
        case 'backward':
          newPosition.x += Math.sin(radY) * distance;
          newPosition.z += Math.cos(radY) * distance;
          break;
        case 'left':
          newPosition.x -= Math.cos(radY) * distance;
          newPosition.z += Math.sin(radY) * distance;
          break;
        case 'right':
          newPosition.x += Math.cos(radY) * distance;
          newPosition.z -= Math.sin(radY) * distance;
          break;
        case 'up':
          newPosition.y += distance;
          break;
        case 'down':
          newPosition.y -= distance;
          break;
      }
      this.camera.setAttribute('position', newPosition);
    },

    resetView: function () {
      if (this.movementMode === 'look' && this.lockPosition) {
        this.camera.setAttribute('position', this.lockPosition);
      } else if (this.initialPosition) {
        this.camera.setAttribute('position', this.initialPosition);
      }
      if (this.initialRotation) {
        this.camera.setAttribute('rotation', this.initialRotation);
      }
    },

    remove: function () {
      document.removeEventListener('keydown', this._onKeyDown);
      document.removeEventListener('keyup', this._onKeyUp);
      document.removeEventListener('mousedown', this._onMouseDown);
      document.removeEventListener('mouseup', this._onMouseUp);
      document.removeEventListener('mousemove', this._onMouseMove);
      document.removeEventListener('wheel', this._onWheel);
      document.removeEventListener('touchstart', this._onTouchStart);
      document.removeEventListener('touchmove', this._onTouchMove);
      document.removeEventListener('touchend', this._onTouchEnd);
      document.removeEventListener('touchcancel', this._onTouchEnd);
    },
  });

  AFRAME.registerComponent('scene-optimizer', {
    init: function () {
      this.el.setAttribute('renderer', 'antialias: true; colorManagement: true');
    },
  });
})();
