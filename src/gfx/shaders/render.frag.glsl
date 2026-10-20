#version 300 es
precision highp float;
in vec2 v;
out vec4 o;
uniform sampler2D S;
uniform sampler2D F;
uniform vec2 res,ct;
uniform float t,sc,day,fl;
uniform vec3 fc;
float cs(vec2 p){
  float a=0.;
  for(int i=0;i<2;i++){
    p+=vec2(sin(p.y*1.7+t*.55+float(i)*2.),cos(p.x*1.3-t*.45+float(i)))*.5;
    a+=pow(1.-abs(sin(p.x*3.+sin(p.y*2.+t*.4))*sin(p.y*3.+cos(p.x*2.-t*.3))),7.);
  }
  return a*.5;
}
void main(){
  vec4 s=texture(S,v);
  vec3 N=vec3(s.b,sqrt(max(0.,1.-dot(s.ba,s.ba))),s.a);
  vec2 uv=v+s.ba*.035;
  float z=max(res.y/9.,res.x/16.);
  vec2 tp=vec2((uv.x-.5)*res.x/z+8.,(1.-uv.y)*res.y/z+4.5-.42*res.y/z+sc);
  vec3 c=texture(F,tp/vec2(16.,12.)).rgb;
  c+=fc*exp(-dot(tp-ct,tp-ct)*1.3)*fl*1.1;
  float cc=cs(vec2(uv.x*res.x/res.y,uv.y)*3.2)*(.5+2.5*length(s.ba));
  c+=mix(vec3(.3,.8,.95),vec3(1.),day)*cc*.3;
  vec3 deep=mix(vec3(.01,.10,.16),vec3(.07,.50,.66),day);
  float dep=smoothstep(.15,.95,length((v-.5)*vec2(1.,.8))*1.5);
  c=mix(c,deep,dep*.5);
  vec3 Ld=normalize(vec3(-.4,.8,.5));
  float sp=pow(max(dot(reflect(-Ld,N),vec3(0,1,0)),0.),70.);
  float fr=pow(1.-N.y,1.6);
  c=mix(c,mix(vec3(.25,.6,.75),vec3(.93,.99,1.),day),fr*.55)+sp*.9;
  c*=1.-.44*dot(v-.5,v-.5);
  o=vec4(c,1);
}