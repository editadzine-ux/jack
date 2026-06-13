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
    this.ovenKeyScale = 1;   // dimmed in non-oven arenas
    this.keyOverride = null; // {x,y,z} ceiling light instead of following the oven
    this.keyColor = null;    // override hue for non-oven arenas
  }

  // each arena gets a distinct light mood
  setMood(name) {
    if (name === 'fridge') {
      this.ambient.color.setHex(0x2a3a4a); this.ambient.intensity = 1.2;
      this.fill.color.setHex(0xcfe8ff); this.fill.groundColor.setHex(0x4a6a82); this.fill.intensity = 1.5;
      this.ovenKeyScale = 0.9; this.keyOverride = { x: 0, y: 9, z: 0 }; this.keyColor = 0xdff0ff;
    } else if (name === 'table') {
      this.ambient.color.setHex(0x4a3a2a); this.ambient.intensity = 0.9;
      this.fill.color.setHex(0x9a8460); this.fill.groundColor.setHex(0x2a1f14); this.fill.intensity = 1.0;
      this.ovenKeyScale = 0.9; this.keyOverride = { x: 0, y: 11, z: 0 }; this.keyColor = 0xffe0b0;
    } else if (name === 'ovenInterior') {
      this.ambient.color.setHex(0x5a1804); this.ambient.intensity = 1.0;
      this.fill.color.setHex(0xff6020); this.fill.groundColor.setHex(0x3a0a02); this.fill.intensity = 0.7;
      this.ovenKeyScale = 1.2; this.keyOverride = { x: 0, y: 8, z: 0 }; this.keyColor = 0xff6a20;
    } else { // kitchen — orange key follows the oven
      this.ambient.color.setHex(0x4a3424); this.ambient.intensity = 0.55;
      this.fill.color.setHex(0x303844); this.fill.groundColor.setHex(0x1a1410); this.fill.intensity = 0.5;
      this.ovenKeyScale = 1; this.keyOverride = null; this.keyColor = null;
    }
  }

  // pulse ∈ [0..1] — oven window glow phase; rage cranks everything
  update(dt, t, ovenPos, pulse = 0.5, rage = false) {
    if (this.keyOverride) {
      this.ovenLight.position.set(this.keyOverride.x, this.keyOverride.y, this.keyOverride.z);
    } else {
      this.ovenLight.position.set(ovenPos.x, ovenPos.y + 2.2, ovenPos.z + 1.6);
    }
    const flicker = 1 + Math.sin(t * 23) * 0.04 + Math.sin(t * 7.3) * 0.05;
    this.ovenLight.intensity = this._base * (0.8 + pulse * 0.5) * flicker * (rage ? 1.5 : 1) * this.ovenKeyScale;
    this.ovenLight.color.setHex(this.keyColor ?? (rage ? 0xffc9a0 : 0xff5a1a));
    this.exitLight.intensity = this.exitOn ? 11 + Math.sin(t * 2.2) * 3 : 0;
  }
}

export function setupShadows(renderer) {
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap is deprecated in r184 and falls back to PCF anyway
  renderer.shadowMap.type = THREE.PCFShadowMap;
}
