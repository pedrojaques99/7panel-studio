// All shaders receive: iTime, iResolution, iAudio[7]
// + user params: iSpeed, iZoom, iColorShift, iDistortion, iGlow, iComplexity
// iAudio = [subBass, bass, lowMid, mid, highMid, high, volume]
// Band weights & reactivity are applied CPU-side before reaching iAudio

export const SHADER_PLASMA = `
uniform float iTime;
uniform vec2 iResolution;
uniform float iAudio[7];
uniform float iSpeed;
uniform float iZoom;
uniform float iColorShift;
uniform float iDistortion;
uniform float iGlow;
uniform float iComplexity;

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*iResolution)/iResolution.y;
  uv*=iZoom;
  float t=iTime*.6*iSpeed;
  float bass=iAudio[1];
  float mid=iAudio[3];
  float hi=iAudio[5];
  float vol=iAudio[6];

  float d=length(uv);
  float a=atan(uv.y,uv.x);

  float v=0.;
  v+=sin(d*10.*iComplexity-t*3.+bass*6.)*.5*iDistortion;
  v+=sin(a*4.*iComplexity+t*2.+mid*4.)*.3*iDistortion;
  v+=cos(d*6.*iComplexity+a*3.-t+vol*8.)*.4*iDistortion;
  v+=sin(uv.x*8.*iComplexity+t*1.5)*sin(uv.y*8.*iComplexity-t)*.3*bass*iDistortion;
  v+=sin(d*16.*iComplexity+a*6.+t*2.5)*.15*hi*iDistortion;

  float pulse=.5+.5*sin(t*2.)*vol;

  vec3 c=vec3(0);
  c.r=sin(v*3.14+t+iColorShift)*.5+.5;
  c.g=sin(v*3.14+t+2.09+iColorShift)*.5+.5;
  c.b=sin(v*3.14+t+4.18+iColorShift)*.5+.5;

  c*=1.-d*(.6-hi*.15);
  c*=(.7+pulse*.6)*iGlow;
  c+=vec3(.02,.01,.03);

  gl_FragColor=vec4(c,1);
}
`

export const SHADER_VORONOI = `
uniform float iTime;
uniform vec2 iResolution;
uniform float iAudio[7];
uniform float iSpeed;
uniform float iZoom;
uniform float iColorShift;
uniform float iDistortion;
uniform float iGlow;
uniform float iComplexity;

vec2 hash(vec2 p){
  p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));
  return fract(sin(p)*43758.5453);
}

void main(){
  vec2 uv=gl_FragCoord.xy/iResolution;
  float t=iTime*.3*iSpeed;
  float bass=iAudio[1];
  float mid=iAudio[3];
  float hi=iAudio[5];
  float vol=iAudio[6];

  vec2 p=uv*6.*iZoom+vec2(t*.2);
  p*=1.+bass*.5*iComplexity;

  vec2 ip=floor(p);
  vec2 fp=fract(p);

  float md=8.;
  vec2 mg;
  for(int y=-1;y<=1;y++)
  for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y));
    vec2 o=hash(ip+g);
    o=.5+.5*sin(t+6.28*o+mid*2.*iDistortion);
    vec2 r=g+o-fp;
    float d=dot(r,r);
    if(d<md){md=d;mg=r;}
  }

  float edge=1.-smoothstep(0.,.05+hi*.1,sqrt(md)-.02);

  vec3 c=vec3(0);
  float h=fract(dot(mg,vec2(.5,.8))+t*.1+iColorShift);
  c=.5+.5*cos(6.28*(h+vec3(0,.33,.67)));
  c*=.3+sqrt(md)*.7;
  c+=edge*vec3(.8,.9,1.)*.5*iGlow;
  c*=(.6+vol*.8)*iGlow;

  gl_FragColor=vec4(c,1);
}
`

export const SHADER_WARP = `
uniform float iTime;
uniform vec2 iResolution;
uniform float iAudio[7];
uniform float iSpeed;
uniform float iZoom;
uniform float iColorShift;
uniform float iDistortion;
uniform float iGlow;
uniform float iComplexity;

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*iResolution)/iResolution.y;
  float t=iTime*iSpeed;
  float sub=iAudio[0];
  float bass=iAudio[1];
  float mid=iAudio[3];
  float hi=iAudio[5];
  float vol=iAudio[6];

  float speed=1.+bass*3.;
  float a=atan(uv.y,uv.x);
  float d=length(uv);

  float tunnel=.5*iZoom/d;
  float twist=(a/3.14159+t*.1*speed+mid*.3)*iDistortion;

  float pattern=0.;
  pattern+=sin(tunnel*20.*iComplexity-t*speed*2.)*.5+.5;
  pattern*=sin(twist*8.*iComplexity)*.5+.5;
  pattern+=sin(tunnel*10.*iComplexity+twist*4.-t*speed)*.3;
  pattern+=sin(tunnel*40.*iComplexity+t*speed*4.)*.12*hi;

  float glw=exp(-d*2.)*(1.+vol*2.)*iGlow;
  float rings=sin(tunnel*(30.+hi*15.)*iComplexity-t*speed*3.)*.5+.5;
  rings*=exp(-d*1.5);

  vec3 c=vec3(0);
  float cs=iColorShift;
  c+=vec3(.1+sin(cs)*.2,.3+sin(cs+2.)*.2,.8+sin(cs+4.)*.2)*pattern*(1.-d);
  c+=vec3(.4+sin(cs+1.)*.2,.1+sin(cs+3.)*.2,.8+sin(cs+5.)*.2)*glw;
  c+=vec3(.6,.8,1.)*rings*.3*sub*iGlow;
  c+=vec3(.3,.5,.9)*mid*.15*(1.-d)*iGlow;
  c*=.5+vol*.8;
  c=pow(c,vec3(.9));

  gl_FragColor=vec4(c,1);
}
`

export const SHADER_FRACTAL = `
uniform float iTime;
uniform vec2 iResolution;
uniform float iAudio[7];
uniform float iSpeed;
uniform float iZoom;
uniform float iColorShift;
uniform float iDistortion;
uniform float iGlow;
uniform float iComplexity;

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*iResolution)/iResolution.y;
  float t=iTime*.2*iSpeed;
  float bass=iAudio[1];
  float mid=iAudio[3];
  float hi=iAudio[5];
  float vol=iAudio[6];

  vec2 c=vec2(-.745+sin(t)*.1*iDistortion+bass*.05*iDistortion,.186+cos(t*.7)*.1*iDistortion+mid*.03*iDistortion);
  vec2 z=uv*2.5*iZoom;

  float iter=0.;
  float maxIter=(60.+vol*40.)*iComplexity;
  for(float i=0.;i<200.;i++){
    if(i>=maxIter)break;
    z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;
    if(dot(z,z)>4.){iter=i;break;}
  }

  float f=iter/maxIter;
  f=sqrt(f);

  vec3 col=vec3(0);
  if(iter>0.){
    float colorSpeed=3.+hi*2.;
    col=.5+.5*cos(3.14*2.*(f*colorSpeed+t+iColorShift+vec3(0,.4,.7)));
    col*=(.5+vol*.8)*iGlow;
  }
  col+=vec3(.02,.01,.04);

  gl_FragColor=vec4(col,1);
}
`

export const SHADER_NEON = `
uniform float iTime;
uniform vec2 iResolution;
uniform float iAudio[7];
uniform float iSpeed;
uniform float iZoom;
uniform float iColorShift;
uniform float iDistortion;
uniform float iGlow;
uniform float iComplexity;

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*iResolution)/iResolution.y;
  uv*=iZoom;
  float t=iTime*iSpeed;
  float bass=iAudio[1];
  float low=iAudio[2];
  float mid=iAudio[3];
  float hi=iAudio[5];
  float vol=iAudio[6];

  float d=length(uv);
  vec3 c=vec3(0);

  for(float i=0.;i<5.;i++){
    float f=(1.+i*.8)*iComplexity;
    float amp=(.15+bass*.2-i*.02)*iDistortion;
    float phase=t*(1.5+i*.3)+i*1.2;
    float wave=sin(uv.x*f*12.+phase)*amp;
    wave+=cos(uv.x*f*6.-phase*.7)*amp*.5*mid;

    float dist=abs(uv.y-wave);
    float thickness=.008+hi*.004;
    float glw=thickness/(dist+.003)*iGlow;
    glw*=exp(-d*.5);

    float hue=.55+i*.12+vol*.1+hi*.08+iColorShift;
    vec3 col=.5+.5*cos(6.28*(hue+vec3(0,.33,.67)));

    c+=col*glw*(0.3+vol*.7);
  }

  float cg=.03/(d+.02)*vol*.5*iGlow;
  c+=vec3(.5,.7,1.)*cg;

  c*=.92+.08*sin(gl_FragCoord.y*3.14);

  c=pow(c,vec3(.85));
  gl_FragColor=vec4(c,1);
}
`
