import * as THREE from 'three';

// three r155+ uses physically based light units, so point light intensities
// are scaled up from the design values (3 / 0.3 etc.) to read correctly.
export class Lighting {
  constructor(scene, ovenPos, exitPos) {
    // Key light: orange/red from the oven. Follows the oven via update().
    this.ovenLight = new THREE.PointLight(0xff5a1a, 3 * 30, 40, 1.6);
    this.ovenLight.position.copy(ovenPos).add(new THREE.Vector3(0, 2.2, 1.6));
    this.ovenLight.castShadow = true;
    this.ovenLight.shadow.mapSize.set(2048, 2048);
    this.ovenLight.shadow.bias = -0.004;
    this.ovenLight.shadow.camera.near = 0.5;
    this.ovenLight.shadow.camera.far = 45;
    scene.add(this.ovenLight);

    // Ambient: very dim warm brown
    this.ambient = new THREE.AmbientLight(0x4a3424, 0.55);
    scene.add(this.ambient);

    // A faint cool fill from "above the counter" so the far side isn't pitch black
    this.fill = new THREE.HemisphereLight(0x303844, 0x1a1410, 0.5);
    scene.add(this.fill);

    // Exit light: small green point light above the cutting board.
    // Off while the exit is locked, soft glow once it opens.
    this.exitOn = false;
    this.exitLight = new THREE.PointLight(0x2bff66, 0, 12, 1.8);
    this.exitLight.position.copy(exitPos).add(new THREE.Vector3(0, 2.4, 0));
    scene.add(this.exitLight);

    this._base = this.ovenLight.intensity;
  }

  // pulse ∈ [0..1] — oven window glow phase; rage cranks everything
  update(dt, t, ovenPos, pulse = 0.5, rage = false) {
    this.ovenLight.position.set(ovenPos.x, ovenPos.y + 2.2, ovenPos.z + 1.6);
    const flicker = 1 + Math.sin(t * 23) * 0.04 + Math.sin(t * 7.3) * 0.05;
    this.ovenLight.intensity = this._base * (0.8 + pulse * 0.5) * flicker * (rage ? 1.5 : 1);
    this.ovenLight.color.setHex(rage ? 0xffc9a0 : 0xff5a1a);
    this.exitLight.intensity = this.exitOn ? 11 + Math.sin(t * 2.2) * 3 : 0;
  }
}

export function setupShadows(renderer) {
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap is deprecated in r184 and falls back to PCF anyway
  renderer.shadowMap.type = THREE.PCFShadowMap;
}
