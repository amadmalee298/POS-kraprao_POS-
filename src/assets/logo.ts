// Official Brand Vector Logo for ครัวกะเพรา POS ENTERPRISE (Updated to matching Stir-fry Wok & Holy Basil Brand Identity)
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Chili Gradient -->
    <linearGradient id="chiliGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF2A2A" />
      <stop offset="60%" stop-color="#E51919" />
      <stop offset="100%" stop-color="#A50808" />
    </linearGradient>

    <!-- Flame Gradient -->
    <linearGradient id="flameGrad" x1="0%" y1="50%" x2="100%" y2="50%">
      <stop offset="0%" stop-color="#B71C1C" />
      <stop offset="40%" stop-color="#E53935" />
      <stop offset="85%" stop-color="#D32F2F" />
      <stop offset="100%" stop-color="#C62828" />
    </linearGradient>

    <!-- Leaf Green Gradient -->
    <linearGradient id="leafGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4CAF50" />
      <stop offset="100%" stop-color="#1B5E20" />
    </linearGradient>

    <linearGradient id="leafGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#66BB6A" />
      <stop offset="100%" stop-color="#2E7D32" />
    </linearGradient>

    <!-- Drop Shadow Filter for subtle 3D pop -->
    <filter id="logoShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.12" />
    </filter>
  </defs>

  <!-- Clean Rounded Square White Badge -->
  <rect width="512" height="512" rx="100" fill="#FFFFFF" />

  <!-- Main Graphical Group -->
  <g filter="url(#logoShadow)">
    
    <!-- Outer Black Circular Border Ring with open gap for the sweeping flame -->
    <!-- Top-Left-Bottom Arc -->
    <path 
      d="M 430 318 C 452 280 456 230 442 185 C 420 115 358 65 280 54 C 185 40 98 88 58 172 C 22 250 36 345 96 408 C 145 460 220 482 292 470 C 318 465 342 455 362 440" 
      fill="none" 
      stroke="#0B0D11" 
      stroke-width="22" 
      stroke-linecap="round" 
    />
    <!-- Bottom Right Small Arc continuation below the flame -->
    <path 
      d="M 180 448 C 215 458 255 456 295 448 C 322 442 346 432 368 418" 
      fill="none" 
      stroke="#0B0D11" 
      stroke-width="22" 
      stroke-linecap="round" 
    />

    <!-- Dynamic Fire Flame Licking Underneath Wok (Sweeping out through the ring gap) -->
    <path 
      d="M 185 388 C 220 398 255 410 290 418 C 340 428 395 415 456 328 C 418 368 370 392 320 392 C 352 382 388 368 418 340 C 382 360 348 368 305 365 C 255 360 215 372 185 388 Z" 
      fill="url(#flameGrad)" 
    />

    <!-- Hot Red Flame Accent Highlights -->
    <path 
      d="M 230 385 C 270 395 320 398 375 370 C 340 378 300 378 260 372 C 242 370 232 375 230 385 Z" 
      fill="#FF5252" 
      opacity="0.85" 
    />

    <!-- Solid Black Cooking Wok (Tilted diagonally upward to the right) -->
    <!-- Wok Outer Body -->
    <path 
      d="M 98 274 C 90 290 94 310 112 334 C 148 384 235 415 326 384 C 354 374 368 352 370 328 C 372 308 360 286 344 270 C 274 218 144 224 98 274 Z" 
      fill="#0B0D11" 
    />

    <!-- Wok Inner Cavity / Dark Depth -->
    <ellipse 
      cx="234" 
      cy="300" 
      rx="122" 
      ry="46" 
      fill="#17191E" 
      transform="rotate(-12, 234, 300)" 
    />

    <!-- White / Silver Lip Highlight on the Right Back Rim of Wok -->
    <path 
      d="M 334 282 C 348 294 362 308 362 322 C 354 326 338 314 326 298 Z" 
      fill="#FFFFFF" 
    />
    <path 
      d="M 326 294 C 344 310 356 326 348 338 C 340 348 322 328 312 308 Z" 
      fill="#D1D5DB" 
    />

    <!-- Cooking Spatula / Turner (ตะหลิว) Resting in Wok (Angled ~42°) -->
    <g transform="translate(10, -5)">
      <!-- Spatula Head / Blade in Pan -->
      <path 
        d="M 284 285 L 340 242 C 346 238 356 240 360 248 L 368 266 C 372 274 368 284 360 290 L 310 324 Z" 
        fill="#1F2937" 
      />
      <!-- Metal Neck / Shaft -->
      <path 
        d="M 356 248 L 378 232 C 382 228 388 230 392 234 L 400 242 L 368 266 Z" 
        fill="#6B7280" 
      />
      <!-- Black Ergonomic Spatula Handle -->
      <path 
        d="M 386 238 L 420 210 C 428 202 438 206 444 214 L 448 220 C 454 228 450 238 442 246 L 406 270 Z" 
        fill="#0B0D11" 
      />
      <!-- Oval Hanging Hole in Handle -->
      <ellipse 
        cx="432" 
        cy="222" 
        rx="8" 
        ry="5" 
        fill="#FFFFFF" 
        transform="rotate(-40, 432, 222)" 
      />
    </g>

    <!-- Dynamic Holy Basil Stem & Leaves (ใบกะเพรา) -->
    <!-- Green Branch Stems -->
    <path 
      d="M 245 288 Q 248 255 260 218 Q 275 175 292 135" 
      stroke="#2E7D32" 
      stroke-width="4" 
      stroke-linecap="round" 
      fill="none" 
    />
    <path 
      d="M 252 248 Q 230 228 192 212" 
      stroke="#2E7D32" 
      stroke-width="3" 
      stroke-linecap="round" 
      fill="none" 
    />
    <path 
      d="M 268 205 Q 295 190 328 178" 
      stroke="#2E7D32" 
      stroke-width="3" 
      stroke-linecap="round" 
      fill="none" 
    />
    <path 
      d="M 260 225 Q 288 220 318 222" 
      stroke="#2E7D32" 
      stroke-width="3" 
      stroke-linecap="round" 
      fill="none" 
    />

    <!-- Holy Basil Leaves (Rich vibrant greens with realistic serrations) -->
    <!-- Left Leaf -->
    <path 
      d="M 192 212 C 172 195 162 170 178 152 C 195 140 216 165 218 190 C 215 206 204 212 192 212 Z" 
      fill="url(#leafGrad2)" 
    />
    <path 
      d="M 192 212 Q 182 180 178 152" 
      stroke="#A5D6A7" 
      stroke-width="2" 
      stroke-linecap="round" 
      fill="none" 
    />

    <!-- Top Right Leaf 1 (Apex) -->
    <path 
      d="M 292 135 C 284 112 300 88 322 92 C 338 98 340 124 322 142 C 306 146 296 140 292 135 Z" 
      fill="url(#leafGrad2)" 
    />
    <!-- Leaf 2 (Upper Right) -->
    <path 
      d="M 276 172 C 265 158 272 132 292 134 C 310 135 315 158 298 176 Z" 
      fill="url(#leafGrad1)" 
    />
    <!-- Leaf 3 (Middle Right) -->
    <path 
      d="M 328 178 C 348 165 372 165 380 182 C 386 198 368 216 342 212 C 330 204 325 190 328 178 Z" 
      fill="url(#leafGrad2)" 
    />
    <!-- Leaf 4 (Lower Right) -->
    <path 
      d="M 318 222 C 338 210 365 215 372 232 C 376 248 358 262 334 256 C 322 248 316 235 318 222 Z" 
      fill="url(#leafGrad1)" 
    />

    <!-- Flying Red Hot Chili Pepper (พริกขี้หนูแดงสด) -->
    <!-- Red Pepper Curved Body -->
    <path 
      d="M 216 162 C 212 198 224 235 264 258 C 248 240 236 216 234 190 C 232 170 224 162 216 162 Z" 
      fill="url(#chiliGrad)" 
    />
    <!-- Chili Glossy Shine Highlight -->
    <path 
      d="M 224 172 Q 224 208 246 236" 
      stroke="#FFA4A2" 
      stroke-width="3.5" 
      stroke-linecap="round" 
      fill="none" 
      opacity="0.85" 
    />
    <!-- Chili Green Stem & Cap -->
    <path 
      d="M 216 162 C 212 150 208 140 214 130 C 218 138 222 148 228 155 C 224 158 220 160 216 162 Z" 
      fill="#1B5E20" 
    />
    <path 
      d="M 212 160 C 206 162 202 168 206 172 C 212 170 218 168 224 164" 
      stroke="#2E7D32" 
      stroke-width="2.5" 
      stroke-linecap="round" 
      fill="none" 
    />

    <!-- Floating Sliced Chili Section with Seeds on Left -->
    <path 
      d="M 148 236 C 158 224 178 226 186 238 C 190 246 186 256 175 260 C 162 264 148 254 148 236 Z" 
      fill="url(#chiliGrad)" 
    />
    <ellipse 
      cx="168" 
      cy="245" 
      rx="9" 
      ry="6" 
      fill="#FFE082" 
      transform="rotate(-15, 168, 245)" 
    />
    <circle cx="166" cy="243" r="2.5" fill="#E65100" />
    <circle cx="171" cy="246" r="2" fill="#E65100" />
    <!-- Chili Spice Sizzle Trail -->
    <path 
      d="M 172 260 Q 186 284 218 298" 
      stroke="#E51919" 
      stroke-width="3" 
      stroke-linecap="round" 
      fill="none" 
    />

    <!-- Green Herb Peppercorn Dots -->
    <circle cx="188" cy="206" r="4.5" fill="#43A047" />
    <circle cx="282" cy="266" r="11" fill="#4CAF50" />
    <circle cx="302" cy="226" r="4" fill="#388E3C" />
    <circle cx="230" cy="275" r="3.5" fill="#4CAF50" />
  </g>
</svg>`;

export const SHOP_LOGO_URL = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
