import * as THREE from 'three';
import gsap from 'gsap';

const OFFSET = new THREE.Vector3(0, 5, 9);
const LOOK_OFFSET = new THREE.Vector3(0, 0.5, 0);
const FOV_NORMAL = 65;
const FOV_CLOSE = 80;

export class GameCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(FOV_NORMAL, aspect, 0.1, 120);
    this.shakeT = 0;
    this.introPlaying = false;
    this._look = new THREE.Vector3();
  }

  /** 3s cinematic dolly from a wide kitchen shot down to the potato. */
  playIntro(playerPos, onComplete) {
    this.introPlaying = true;
    const from = new THREE.Vector3(-14, 16, 20);
    const to = playerPos.clone().add(OFFSET);
    this.camera.position.copy(from);
    this._look.set(0, 2, -4); // take in the whole kitchen first
    const lookTo = playerPos.clone().add(LOOK_OFFSET);
    gsap.to(this.camera.position, {
      x: to.x, y: to.y, z: to.z, duration: 3, ease: 'power2.inOut',
    });
    gsap.to(this._look, {
      x: lookTo.x, y: lookTo.y, z: lookTo.z, duration: 3, ease: 'power2.inOut',
      onComplete: () => { this.introPlaying = false; onComplete?.(); },
    });
  }

  shake() { this.shakeT = 0.4; }

  update(dt, playerPos, ovenDist) {
    if (this.introPlaying) {
      this.camera.lookAt(this._look);
      return;
    }

    // position lerps 6% per frame (normalised to 60fps)
    const target = playerPos.clone().add(OFFSET);
    const k = 1 - Math.pow(1 - 0.06, dt * 60);
    this.camera.position.lerp(target, k);

    // FOV: 65° → 80° when the oven is within 5 units, easing over ~0.5s
    const fovTarget = ovenDist < 5 ? FOV_CLOSE : FOV_NORMAL;
    this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt / 0.5 * 2);
    this.camera.updateProjectionMatrix();

    this._look.copy(playerPos).add(LOOK_OFFSET);
    this.camera.lookAt(this._look);

    // hit shake: ±0.3 random offset decaying over 0.4s
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = Math.max(0, this.shakeT / 0.4) * 0.3;
      this.camera.position.x += (Math.random() - 0.5) * 2 * a;
      this.camera.position.y += (Math.random() - 0.5) * 2 * a;
      this.camera.position.z += (Math.random() - 0.5) * 2 * a;
    }
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
