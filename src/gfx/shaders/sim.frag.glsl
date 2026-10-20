#version 300 es
precision highp float;
in vec2 v;
out vec4 o;
uniform sampler2D S;
uniform vec2 T;
void main(){
  vec4 s=texture(S,v);
  float r=texture(S,v+vec2(T.x,0)).r,l=texture(S,v-vec2(T.x,0)).r,u=texture(S,v+vec2(0,T.y)).r,d=texture(S,v-vec2(0,T.y)).r;
  s.g+=((r+l+u+d)*.25-s.r)*2.;
  s.g*=.996;
  s.r+=s.g;
  vec3 dx=vec3(T.x,r-s.r,0),dy=vec3(0,u-s.r,T.y);
  s.ba=normalize(cross(dy,dx)).xz;
  o=s;
}