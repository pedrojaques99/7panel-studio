import svgPaths from "./svg-3qj1ipvk3n";

function Marks() {
  const cx = 40.5, cy = 37.5, r = 32
  const angles = Array.from({ length: 11 }, (_, i) => -135 + i * 27)
  return (
    <svg className="absolute inset-0 size-full" fill="none" viewBox="0 0 81 75" style={{ pointerEvents: 'none' }}>
      {angles.map((deg, i) => {
        const rad = (deg - 90) * Math.PI / 180
        const x1 = cx + Math.cos(rad) * (r - 4)
        const y1 = cy + Math.sin(rad) * (r - 4)
        const x2 = cx + Math.cos(rad) * r
        const y2 = cy + Math.sin(rad) * r
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={1.8} strokeLinecap="round" opacity={0.5} />
      })}
    </svg>
  )
}

function Dial({ rotation = 0 }: { rotation?: number }) {
  return (
    <div 
      className="absolute h-[35px] left-[25px] top-[20px] w-[35px] transition-transform duration-75" 
      data-name="Dial"
      style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }}
    >
      <div className="absolute inset-[-9.31%_-20.96%_-38.24%_-20.73%]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 46.5859 50.1592">
          <g id="Dial">
            <circle cx="23.2541" cy="19.6056" fill="url(#paint0_radial_1_128)" id="Base" r="16.2343" stroke="url(#paint1_linear_1_128)" strokeWidth="0.410341" />
            <g filter="url(#filter0_d_1_128)" id="Depth">
              <path d={svgPaths.p21baad00} fill="url(#paint2_linear_1_128)" />
            </g>
            <circle cx="22.2931" cy="22.8663" fill="url(#paint3_radial_1_128)" id="Front" r="14.1931" stroke="url(#paint4_linear_1_128)" strokeWidth="0.2" />
            <g id="Mark">
              <g filter="url(#filter1_i_1_128)" id="Rectangle 10">
                <rect fill="var(--fill-0, #D9D9D9)" height="6.10427" width="1.21356" x="21.6702" y="8.54028" />
              </g>
              <g filter="url(#filter2_i_1_128)" id="Rectangle 11">
                <path d={svgPaths.p10fa3680} fill="var(--fill-0, #D9D9D9)" />
              </g>
            </g>
          </g>
          <defs>
            <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="50.1592" id="filter0_d_1_128" width="46.5859" x="0" y="0">
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feColorMatrix in="SourceAlpha" result="hardAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
              <feOffset dy="4" />
              <feGaussianBlur stdDeviation="4.5" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0" />
              <feBlend in2="BackgroundImageFix" mode="normal" result="effect1_dropShadow_1_128" />
              <feBlend in="SourceGraphic" in2="effect1_dropShadow_1_128" mode="normal" result="shape" />
            </filter>
            <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="6.30427" id="filter1_i_1_128" width="1.41356" x="21.6702" y="8.34028">
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
              <feColorMatrix in="SourceAlpha" result="hardAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
              <feOffset dx="0.2" dy="-0.2" />
              <feGaussianBlur stdDeviation="0.15" />
              <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
              <feBlend in2="shape" mode="normal" result="effect1_innerShadow_1_128" />
            </filter>
            <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="1.29075" id="filter2_i_1_128" width="1.82126" x="21.6614" y="7.44952">
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
              <feColorMatrix in="SourceAlpha" result="hardAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
              <feOffset dx="0.2" dy="0.2" />
              <feGaussianBlur stdDeviation="0.15" />
              <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
              <feBlend in2="shape" mode="normal" result="effect1_innerShadow_1_128" />
            </filter>
            <radialGradient cx="0" cy="0" gradientTransform="translate(18.8631 27.2155) rotate(-62.354) scale(21.4641 24.2694)" gradientUnits="userSpaceOnUse" id="paint0_radial_1_128" r="1">
              <stop offset="0.279912" stopColor="#424344" />
              <stop offset="0.845073" stopColor="#16171B" />
            </radialGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="paint1_linear_1_128" x1="23.2541" x2="23.2541" y1="3.1662" y2="36.045">
              <stop />
              <stop offset="1" stopColor="#909090" />
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="paint2_linear_1_128" x1="37.5861" x2="9.98346" y1="15.0227" y2="18.6301">
              <stop stopColor="#1D1D1D" />
              <stop offset="0.20755" stopColor="#4C4A48" />
              <stop offset="0.344393" stopColor="#6A6A6A" />
              <stop offset="0.529115" stopColor="#6A6A6A" />
              <stop offset="0.691551" stopColor="#4C4A48" />
              <stop offset="0.959144" stopColor="#1D1D1D" />
            </linearGradient>
            <radialGradient cx="0" cy="0" gradientTransform="translate(19.1824 14.4709) rotate(82.1932) scale(22.9008)" gradientUnits="userSpaceOnUse" id="paint3_radial_1_128" r="1">
              <stop offset="0.0390484" stopColor="#878584" />
              <stop offset="1" stopColor="#33322F" />
            </radialGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="paint4_linear_1_128" x1="14.7551" x2="24.8845" y1="10.9653" y2="38.2839">
              <stop stopColor="#919090" />
              <stop offset="0.569707" stopColor="#343333" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function Bass({ rotation = 0 }: { rotation?: number }) {
  return (
    <div className="absolute contents left-0 top-0" data-name="Bass">
      <Marks />
      <Dial rotation={rotation} />
    </div>
  );
}

export default function Knob({ rotation = 0 }: { rotation?: number }) {
  return (
    <div className="relative size-full" data-name="KNOB 1">
      <Bass rotation={rotation} />
    </div>
  );
}