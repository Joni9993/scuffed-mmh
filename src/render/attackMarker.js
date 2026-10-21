import * as THREE from 'three';

/** One draw call per lane: a signed-distance capsule draws a fixed danger boundary,
 * a growing charge and its clock together. Sweeps need many lanes on mobile too. */
export function createAttackMarker(length, radius) {
  const geometry = new THREE.PlaneGeometry(length + radius * 2, radius * 2);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{uLength:{value:length},uRadius:{value:radius},uProgress:{value:0},uActive:{value:0},uColor:{value:new THREE.Color('#ffb350')}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      varying vec2 vUv;
      uniform float uLength,uRadius,uProgress,uActive;
      uniform vec3 uColor;
      void main(){
        vec2 p=(vUv-.5)*vec2(uLength+2.0*uRadius,2.0*uRadius);
        float d=length(vec2(max(abs(p.x)-uLength*.5,0.0),p.y))-uRadius;
        if(d>0.0)discard;
        float border=smoothstep(-.12,-.035,d);
        float fillDistance=uLength>.01?abs(p.y)/uRadius:length(p)/uRadius;
        float fill=1.0-smoothstep(uProgress-.035,uProgress+.035,fillDistance);
        float alpha=mix(.065,.17+.14*uProgress,fill);
        alpha=mix(alpha,.95,border);
        float clockR=min(1.2,uRadius*.5);
        float ring=(1.0-smoothstep(.045,.09,abs(length(p)-clockR)));
        float angle=mod(atan(p.y,p.x)+4.712389,6.283185)/6.283185;
        float clock=ring*step(angle,uProgress)*(1.0-uActive);
        vec3 color=mix(uColor,vec3(1.0,.94,.78),max(clock,border*step(.9,uProgress)*(1.0-uActive)));
        alpha=max(alpha,clock*.95);
        alpha=mix(alpha,max(alpha,.44),uActive);
        gl_FragColor=vec4(color,alpha);
      }`,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=3;
  mesh.userData.update=(progress,active,color)=>{
    material.uniforms.uProgress.value=Math.max(0,Math.min(1,progress));
    material.uniforms.uActive.value=active?1:0;
    material.uniforms.uColor.value.set(active?'#ff4168':color??'#ffb350');
  };
  mesh.userData.dispose=()=>{geometry.dispose();material.dispose();};
  return mesh;
}
