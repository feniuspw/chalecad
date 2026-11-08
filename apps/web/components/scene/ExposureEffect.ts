import { BlendFunction, Effect } from 'postprocessing';
import { Uniform } from 'three';
import { wrapEffect } from '@react-three/postprocessing';

const FRAGMENT = `
uniform float exposure;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * exposure, inputColor.a);
}`;

/** Exposição simples (multiplica a cor linear antes do tone mapping). */
export class ExposureEffectImpl extends Effect {
  constructor({ exposure = 1 }: { exposure?: number } = {}) {
    super('ExposureEffect', FRAGMENT, { blendFunction: BlendFunction.SRC, uniforms: new Map([['exposure', new Uniform(exposure)]]) });
  }

  get exposure(): number {
    return (this.uniforms.get('exposure') as Uniform<number>).value;
  }

  set exposure(v: number) {
    (this.uniforms.get('exposure') as Uniform<number>).value = v;
  }
}

export const Exposure = wrapEffect(ExposureEffectImpl);
