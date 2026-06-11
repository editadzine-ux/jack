import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, NoiseEffect, VignetteEffect, ChromaticAberrationEffect,
  BlendFunction,
} from 'postprocessing';

export class PostFX {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new BloomEffect({
      luminanceThreshold: 0.8,
      intensity: 1.2,
      mipmapBlur: true,
    });

    this.noise = new NoiseEffect({
      blendFunction: BlendFunction.OVERLAY,
      premultiply: true,
    });
    this.noise.blendMode.opacity.value = 0.025; // 2.5% film grain

    this.vignette = new VignetteEffect({ offset: 0.6, darkness: 0.5 });

    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0, 0),
      radialModulation: true,
      modulationOffset: 0.15,
    });
    this._chromaSpike = 0;

    this.composer.addPass(new EffectPass(camera, this.bloom, this.chroma, this.noise, this.vignette));
  }

  /** Chromatic aberration spikes to 0.008 on damage, decays over 0.4s. */
  damageSpike() { this._chromaSpike = 0.4; }

  update(dt) {
    if (this._chromaSpike > 0) {
      this._chromaSpike = Math.max(0, this._chromaSpike - dt);
      const k = (this._chromaSpike / 0.4) * 0.008;
      this.chroma.offset.set(k, k * 0.6);
    } else {
      this.chroma.offset.set(0, 0);
    }
  }

  render(dt) {
    this.composer.render(dt);
  }

  resize(w, h) {
    this.composer.setSize(w, h);
  }
}
