/** Subtle object-space scale/leather detail. No textures, lights or extra draws. */
export function dragonSurface(material, membrane = false) {
  const compile = material.onBeforeCompile, cache = material.customProgramCacheKey;
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = 'varying vec3 vDragonPosition; varying vec3 vDragonNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDragonPosition = position; vDragonNormal = normal;');
    shader.fragmentShader = `varying vec3 vDragonPosition; varying vec3 vDragonNormal;
float dragonHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
` + shader.fragmentShader;
    const detail = membrane ? `
vec2 skinUV = vDragonPosition.xz;
float leather = sin(skinUV.x*19.0 + sin(skinUV.y*7.0))*sin(skinUV.y*23.0);
float striation = sin(skinUV.y*32.0 + sin(skinUV.x*3.0)*2.0);
diffuseColor.rgb *= .94 + leather*.045 + striation*.035;
` : `
vec3 skinN = abs(normalize(vDragonNormal));
vec2 skinUV = (skinN.y > skinN.x && skinN.y > skinN.z) ? vDragonPosition.xz : (skinN.x > skinN.z ? vDragonPosition.zy : vDragonPosition.xy);
skinUV *= 7.0;
skinUV.x += mod(floor(skinUV.y),2.0)*.5;
vec2 skinCell = fract(skinUV)-.5;
float scaleRidge = abs(skinCell.x)*1.45 + abs(skinCell.y)*.85;
float scaleEdge = smoothstep(.64,.88,scaleRidge);
float scaleVariation = dragonHash(floor(skinUV));
diffuseColor.rgb *= .87 + scaleVariation*.17 - scaleEdge*.18;
`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + detail);
  };
  material.customProgramCacheKey = function() { return cache.call(this) + (membrane ? '/dragon-leather-v1' : '/dragon-scale-v1'); };
  return material;
}
