export const renderSrc = `#version 300 es
precision highp float;
in vec2 v;
out vec4 o;
uniform sampler2D S;
uniform sampler2D F;
uniform vec2 res,ct;
uniform float t,sc,day,fl,age,pf;
uniform vec3 fc;
float cs(vec2 p){
  float a=0.;
  for(int i=0;i<2;i++){
    p+=vec2(sin(p.y*1.7+t*.55+float(i)*2.),cos(p.x*1.3-t*.45+float(i)))*.5;
    a+=pow(1.-abs(sin(p.x*3.+sin(p.y*2.+t*.4))*sin(p.y*3.+cos(p.x*2.-t*.3))),11.);
  }
  return a*.5;
}
void main(){
  vec4 s=texture(S,v);
  vec3 N=vec3(s.b,sqrt(max(0.,1.-dot(s.ba,s.ba))),s.a);
  vec2 uv=v+s.ba*.05;
  float z=min(res.y/9.,res.x*(1.-pf)/16.);
  vec2 tp=vec2((uv.x-.5-pf*.5)*res.x/z+8.4,(1.-uv.y)*res.y/z+5.5-.42*res.y/z+sc);
  vec2 dq=tp-ct;
  float r=length(dq), lw=exp(-age*1.1);
  float R=.6+.07*sin(age*11.)*exp(-age*3.);
  float wv=(r-age*2.4)*4.5;
  float lens=(1.-smoothstep(R-.07,R,r))*lw;
  vec2 tq=mix(tp, ct+dq/(1.+.8*lw), lens);
  vec3 c=texture(F,tq/vec2(16.,12.)).rgb;
  c*=.8+.32*exp(-dot(dq,dq)/16.);
  c+=fc*exp(-dot(dq,dq)*1.3)*fl*1.1
    +fc*lens*.35
    +vec3(1.)*(1.-smoothstep(0.,.07,abs(r-R)))*lw*.8
    +fc*exp(-wv*wv)*exp(-age*2.2)*.9;
  float cc=cs(vec2(uv.x*res.x/res.y,uv.y)*2.2);
  cc*=.55+1.6*length(s.ba);
  c+=mix(vec3(.25,.7,.9),vec3(.9,1.,1.),day)*cc*.16;
  vec3 deep=mix(vec3(.01,.10,.16),vec3(.04,.36,.55),day);
  c*=vec3(.82,.95,1.);
  float dep=smoothstep(.15,.95,length((v-.5)*vec2(1.,.8))*1.5);
  c=mix(c,deep,dep*.7);
  vec3 Ld=normalize(vec3(-.4,.8,.5));
  float sp=pow(max(dot(reflect(-Ld,N),vec3(0,1,0)),0.),70.);
  float fr=pow(1.-N.y,1.6);
  c=mix(c,mix(vec3(.25,.6,.75),vec3(.93,.99,1.),day),fr*.55)+sp*.9;
  float bio=(abs(s.g)+abs(s.r))*1.5;
  vec3 bioColor=vec3(0.498,0.941,1.0);
  c+=bioColor*bio*(1.0-day)*0.4;
  c=min(c,vec3(.95))+sp*.9;
  c*=1.-.44*dot(v-.5,v-.5);
  o=vec4(c,1);
}
`;
