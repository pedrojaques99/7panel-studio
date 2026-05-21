// Post-processing fragment shaders — all receive:
// iTexture (sampler2D), iResolution (vec2), iTime (float), iIntensity (float), iAudio[7]

export type PostFxId = 'crt' | 'chromatic' | 'bloom' | 'vhs' | 'grain' | 'pixelate' | 'edgeglow'

export interface PostFxDef {
  id: PostFxId
  label: string
  frag: string
}

const HEADER = `
precision mediump float;
uniform sampler2D iTexture;
uniform vec2 iResolution;
uniform float iTime;
uniform float iIntensity;
uniform float iAudio[7];
`

export const POST_FX_LIST: PostFxDef[] = [
  {
    id: 'crt',
    label: 'CRT',
    frag: `${HEADER}
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution;
  // barrel distortion
  vec2 c=uv*2.-1.;
  float d=dot(c,c);
  float k=.15*iIntensity;
  uv=.5+(c*(1.+k*d))*0.5;
  if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(0,0,0,1);return;}
  vec4 col=texture2D(iTexture,uv);
  // scanlines
  float scan=sin(gl_FragCoord.y*3.14159*1.5)*.5+.5;
  col.rgb*=.85+.15*scan*iIntensity;
  // phosphor RGB subpixels
  float px=mod(gl_FragCoord.x,3.);
  if(px<1.) col.gb*=1.-.15*iIntensity;
  else if(px<2.) col.rb*=1.-.15*iIntensity;
  else col.rg*=1.-.15*iIntensity;
  // vignette
  float vig=1.-d*.4*iIntensity;
  col.rgb*=vig;
  col.a=1.;
  gl_FragColor=col;
}`,
  },
  {
    id: 'chromatic',
    label: 'CHROMA',
    frag: `${HEADER}
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution;
  vec2 c=uv-.5;
  float d=length(c);
  float off=(.003+iAudio[1]*.008)*iIntensity;
  vec2 dir=normalize(c+.0001)*off*d;
  float r=texture2D(iTexture,uv+dir).r;
  float g=texture2D(iTexture,uv).g;
  float b=texture2D(iTexture,uv-dir).b;
  gl_FragColor=vec4(r,g,b,1);
}`,
  },
  {
    id: 'bloom',
    label: 'BLOOM',
    frag: `${HEADER}
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution;
  vec4 col=texture2D(iTexture,uv);
  // 9-tap blur for bloom extraction
  vec4 bloom=vec4(0);
  float px=1./iResolution.x;
  float py=1./iResolution.y;
  float s=2.+iAudio[6]*3.;
  for(int x=-1;x<=1;x++)
  for(int y=-1;y<=1;y++){
    bloom+=texture2D(iTexture,uv+vec2(float(x)*px*s,float(y)*py*s));
  }
  bloom/=9.;
  // threshold
  vec4 bright=max(bloom-vec4(.5),vec4(0))*2.;
  col+=bright*(.6*iIntensity);
  gl_FragColor=vec4(col.rgb,1);
}`,
  },
  {
    id: 'vhs',
    label: 'VHS',
    frag: `${HEADER}
float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution;
  // tracking distortion
  float t=iTime*3.;
  float track=sin(uv.y*80.+t)*sin(uv.y*20.-t*2.)*.002*iIntensity;
  // occasional glitch line
  float glitch=step(.995-iAudio[1]*.01*iIntensity,rand(vec2(floor(uv.y*100.),floor(iTime*10.))));
  track+=glitch*.03*iIntensity;
  uv.x+=track;
  // color bleed
  float off=.003*iIntensity;
  float r=texture2D(iTexture,vec2(uv.x+off,uv.y)).r;
  float g=texture2D(iTexture,uv).g;
  float b=texture2D(iTexture,vec2(uv.x-off,uv.y)).b;
  vec3 col=vec3(r,g,b);
  // noise
  float n=rand(uv+fract(iTime))*.12*iIntensity;
  col+=n;
  // slight desaturation
  float lum=dot(col,vec3(.3,.59,.11));
  col=mix(col,vec3(lum),.2*iIntensity);
  gl_FragColor=vec4(col,1);
}`,
  },
  {
    id: 'grain',
    label: 'GRAIN',
    frag: `${HEADER}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution;
  vec4 col=texture2D(iTexture,uv);
  float g=hash(uv*iResolution+fract(iTime*60.))*2.-1.;
  col.rgb+=g*.12*iIntensity;
  // slight flicker
  col.rgb*=1.+sin(iTime*30.)*.01*iIntensity;
  gl_FragColor=vec4(col.rgb,1);
}`,
  },
  {
    id: 'pixelate',
    label: 'PIXEL',
    frag: `${HEADER}
void main(){
  float cellSize=max(2.,4.+(1.-iIntensity)*12.);
  vec2 uv=gl_FragCoord.xy/iResolution;
  vec2 cell=floor(gl_FragCoord.xy/cellSize)*cellSize+cellSize*.5;
  vec2 snapped=cell/iResolution;
  vec4 col=texture2D(iTexture,snapped);
  gl_FragColor=vec4(col.rgb,1);
}`,
  },
  {
    id: 'edgeglow',
    label: 'EDGE',
    frag: `${HEADER}
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution;
  vec4 col=texture2D(iTexture,uv);
  float px=1./iResolution.x;
  float py=1./iResolution.y;
  // sobel
  float tl=dot(texture2D(iTexture,uv+vec2(-px,py)).rgb,vec3(.3,.59,.11));
  float t_=dot(texture2D(iTexture,uv+vec2(0,py)).rgb,vec3(.3,.59,.11));
  float tr=dot(texture2D(iTexture,uv+vec2(px,py)).rgb,vec3(.3,.59,.11));
  float ml=dot(texture2D(iTexture,uv+vec2(-px,0)).rgb,vec3(.3,.59,.11));
  float mr=dot(texture2D(iTexture,uv+vec2(px,0)).rgb,vec3(.3,.59,.11));
  float bl=dot(texture2D(iTexture,uv+vec2(-px,-py)).rgb,vec3(.3,.59,.11));
  float b_=dot(texture2D(iTexture,uv+vec2(0,-py)).rgb,vec3(.3,.59,.11));
  float br=dot(texture2D(iTexture,uv+vec2(px,-py)).rgb,vec3(.3,.59,.11));
  float gx=tl+2.*ml+bl-tr-2.*mr-br;
  float gy=tl+2.*t_+tr-bl-2.*b_-br;
  float edge=length(vec2(gx,gy));
  // neon glow from edges
  float hue=fract(iTime*.1+edge*2.);
  vec3 neon=.5+.5*cos(6.28*(hue+vec3(0,.33,.67)));
  col.rgb+=neon*edge*2.*iIntensity*(1.+iAudio[6]);
  gl_FragColor=vec4(col.rgb,1);
}`,
  },
]
