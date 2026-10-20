export const dropSrc = `#version 300 es
precision highp float;
in vec2 v;
out vec4 o;
uniform sampler2D S;
uniform vec2 C;
uniform float R,K,A;
void main(){
  vec4 s=texture(S,v);
  vec2 q=v-C;
  q.x*=A;
  float d=max(0.,1.-length(q)/R);
  d=.5-cos(d*3.14159265)*.5;
  s.r+=d*K;
  o=s;
}
`;