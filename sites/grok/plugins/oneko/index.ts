/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CatIcon } from "@components/icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const ONEKO_GIF = "https://raw.githubusercontent.com/adryd325/oneko.js/14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif";

const ONEKO_SCRIPT = "(function oneko(){const nekoEl=document.createElement(\"div\");let nekoPosX=32,nekoPosY=32,mousePosX=0,mousePosY=0,frameCount=0,idleTime=0,idleAnimation=null,idleAnimationFrame=0;const nekoSpeed=10;const spriteSets={idle:[[-3,-3]],alert:[[-7,-3]],scratchSelf:[[-5,0],[-6,0],[-7,0]],scratchWallN:[[0,0],[0,-1]],scratchWallS:[[-7,-1],[-6,-2]],scratchWallE:[[-2,-2],[-2,-3]],scratchWallW:[[-4,0],[-4,-1]],tired:[[-3,-2]],sleeping:[[-2,0],[-2,-1]],N:[[-1,-2],[-1,-3]],NE:[[0,-2],[0,-3]],E:[[-3,0],[-3,-1]],SE:[[-5,-1],[-5,-2]],S:[[-6,-3],[-7,-2]],SW:[[-5,-3],[-6,-1]],W:[[-4,-2],[-4,-3]],NW:[[-1,0],[-1,-1]]};function init(){nekoEl.id=\"oneko\";nekoEl.ariaHidden=true;nekoEl.style.width=\"32px\";nekoEl.style.height=\"32px\";nekoEl.style.position=\"fixed\";nekoEl.style.pointerEvents=\"none\";nekoEl.style.imageRendering=\"pixelated\";nekoEl.style.left=nekoPosX-16+\"px\";nekoEl.style.top=nekoPosY-16+\"px\";nekoEl.style.zIndex=2147483647;nekoEl.style.backgroundImage=\"url(ONEKO_GIF_URL)\";document.body.appendChild(nekoEl);document.addEventListener(\"mousemove\",function(e){mousePosX=e.clientX;mousePosY=e.clientY});window.requestAnimationFrame(onAnimationFrame)}let lastFrameTimestamp;function onAnimationFrame(timestamp){if(!nekoEl.isConnected)return;if(!lastFrameTimestamp)lastFrameTimestamp=timestamp;if(timestamp-lastFrameTimestamp>100){lastFrameTimestamp=timestamp;frame()}window.requestAnimationFrame(onAnimationFrame)}function setSprite(name,frame){const sprite=spriteSets[name][frame%spriteSets[name].length];nekoEl.style.backgroundPosition=sprite[0]*32+\"px \"+sprite[1]*32+\"px\"}function resetIdleAnimation(){idleAnimation=null;idleAnimationFrame=0}function idle(){idleTime+=1;if(idleTime>10&&Math.floor(Math.random()*200)==0&&idleAnimation==null){let a=[\"sleeping\",\"scratchSelf\"];if(nekoPosX<32)a.push(\"scratchWallW\");if(nekoPosY<32)a.push(\"scratchWallN\");if(nekoPosX>window.innerWidth-32)a.push(\"scratchWallE\");if(nekoPosY>window.innerHeight-32)a.push(\"scratchWallS\");idleAnimation=a[Math.floor(Math.random()*a.length)]}switch(idleAnimation){case\"sleeping\":if(idleAnimationFrame<8){setSprite(\"tired\",0);break}setSprite(\"sleeping\",Math.floor(idleAnimationFrame/4));if(idleAnimationFrame>192)resetIdleAnimation();break;case\"scratchWallN\":case\"scratchWallS\":case\"scratchWallE\":case\"scratchWallW\":case\"scratchSelf\":setSprite(idleAnimation,idleAnimationFrame);if(idleAnimationFrame>9)resetIdleAnimation();break;default:setSprite(\"idle\",0);return}idleAnimationFrame+=1}function frame(){frameCount+=1;const diffX=nekoPosX-mousePosX;const diffY=nekoPosY-mousePosY;const distance=Math.sqrt(diffX**2+diffY**2);if(distance<nekoSpeed||distance<48){idle();return}idleAnimation=null;idleAnimationFrame=0;if(idleTime>1){setSprite(\"alert\",0);idleTime=Math.min(idleTime,7);idleTime-=1;return}let direction;direction=diffY/distance>0.5?\"N\":\"\";direction+=diffY/distance<-0.5?\"S\":\"\";direction+=diffX/distance>0.5?\"W\":\"\";direction+=diffX/distance<-0.5?\"E\":\"\";setSprite(direction,frameCount);nekoPosX-=(diffX/distance)*nekoSpeed;nekoPosY-=(diffY/distance)*nekoSpeed;nekoPosX=Math.min(Math.max(16,nekoPosX),window.innerWidth-16);nekoPosY=Math.min(Math.max(16,nekoPosY),window.innerHeight-16);nekoEl.style.left=nekoPosX-16+\"px\";nekoEl.style.top=nekoPosY-16+\"px\"}init()})();";

export default definePlugin({
    name: "Oneko",
    icon: CatIcon,
    description: "Cat follows your mouse cursor.",
    authors: [Devs.adryd],
    tags: ["appearance"],
    cleanupSelectors: ["#oneko"],

    start() {
        const s = ONEKO_SCRIPT.replace("ONEKO_GIF_URL", ONEKO_GIF);
        const el = document.createElement("script");
        el.src = URL.createObjectURL(new Blob([s], { type: "text/javascript" }));
        document.head.appendChild(el);
        el.addEventListener("load", () => { el.remove(); URL.revokeObjectURL(el.src); }, { once: true });
    },
});
