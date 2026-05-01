import imgEllipse12 from "figma:asset/31a74ddd708b053a813a068edffcc16360de0acd.png";

function Group() {
  return (
    <div className="absolute contents left-[11px] pointer-events-none top-[25px]">
      <div className="absolute h-[214px] left-[11px] top-[25px] w-[78px]">
        <div aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgb(190, 190, 190) 0%, rgb(237, 237, 237) 31.015%, rgb(255, 255, 255) 45.835%, rgb(234, 232, 232) 59.831%, rgb(169, 169, 169) 92.763%)" }} />
        <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_5px_2px_10px_rgba(0,0,0,0.08)]" />
      </div>
      <div className="absolute h-[214px] left-[11px] rounded-tl-[40px] top-[25px] w-[78px]">
        <div aria-hidden="true" className="absolute inset-0 rounded-tl-[40px]" style={{ backgroundImage: "linear-gradient(rgb(190, 190, 190) 0%, rgb(237, 237, 237) 31.015%, rgb(255, 255, 255) 45.835%, rgb(234, 232, 232) 59.831%, rgb(169, 169, 169) 92.763%)" }} />
        <div className="absolute inset-0 rounded-[inherit] shadow-[inset_1px_14px_4px_1px_rgba(0,0,0,0.08)]" />
      </div>
    </div>
  );
}

function Toggle() {
  return (
    <div className="absolute contents left-[23px] top-[106px]" data-name="Toggle">
      <div className="absolute flex h-[53.41px] items-center justify-center left-[23px] top-[106px] w-[53.409px]">
        <div className="flex-none rotate-180">
          <div className="h-[53.41px] relative w-[53.409px]">
            <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 53.4094 53.41">
              <ellipse cx="26.7047" cy="26.705" fill="var(--fill-0, white)" id="Ellipse 14" rx="26.7047" ry="26.705" />
            </svg>
          </div>
        </div>
      </div>
      <div className="absolute flex h-[53.41px] items-center justify-center left-[23px] top-[106px] w-[53.409px]">
        <div className="flex-none rotate-180">
          <div className="h-[53.41px] relative w-[53.409px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" height="53.41" src={imgEllipse12} width="53.409" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ToggleMiddle() {
  return (
    <div className="relative size-full" data-name="Toggle Middle">
      <div className="absolute h-[264px] left-0 shadow-[2px_2px_2px_0px_rgba(0,0,0,0.25)] top-0 w-[100px]" style={{ backgroundImage: "linear-gradient(-90deg, rgb(109, 117, 126) 5.5%, rgb(186, 194, 204) 10.623%, rgb(217, 222, 227) 25.513%, rgb(205, 206, 207) 40.502%, rgb(233, 233, 233) 70.52%, rgb(222, 222, 222) 90.71%, rgb(155, 160, 166) 100%)" }} />
      <Group />
      <div className="absolute flex h-[136px] items-center justify-center left-[50px] top-[64px] w-0" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "21" } as React.CSSProperties}>
        <div className="flex-none rotate-90">
          <div className="h-0 relative w-[136px]">
            <div className="absolute inset-[-10px_-7.35%]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 156 20">
                <g filter="url(#filter0_i_1_1602)" id="Line 6">
                  <path d="M10 10H146" stroke="var(--stroke-0, #403F3F)" strokeLinecap="round" strokeWidth="20" />
                </g>
                <defs>
                  <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="24" id="filter0_i_1_1602" width="160" x="0" y="0">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
                    <feColorMatrix in="SourceAlpha" result="hardAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
                    <feOffset dx="4" dy="4" />
                    <feGaussianBlur stdDeviation="2" />
                    <feComposite in2="hardAlpha" k2="-1" k3="1" operator="arithmetic" />
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" />
                    <feBlend in2="shape" mode="normal" result="effect1_innerShadow_1_1602" />
                  </filter>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Helvetica:Bold',sans-serif] h-[45px] justify-center leading-[0] left-[-38px] not-italic text-[#5c5c5c] text-[24px] text-center top-[200.5px] w-[58px]">
        <p className="leading-[normal]">D</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Helvetica:Bold',sans-serif] h-[45px] justify-center leading-[0] left-[-38px] not-italic text-[#5c5c5c] text-[24px] text-center top-[66.5px] w-[58px]">
        <p className="leading-[normal]">U</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Helvetica:Bold',sans-serif] h-[45px] justify-center leading-[0] left-[-38px] not-italic text-[#5c5c5c] text-[24px] text-center top-[133.5px] w-[58px]">
        <p className="leading-[normal]">M</p>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col font-['Helvetica:Bold',sans-serif] h-[45px] justify-center leading-[0] left-[50px] not-italic text-[#5c5c5c] text-[24px] text-center top-[-31.5px] w-[124px]">
        <p className="leading-[normal]">TOGGLE</p>
      </div>
      <Toggle />
    </div>
  );
}