<script setup lang="ts">
import type { communityTimeline } from '@web/modules/landing/community-freshness'
import { hawkerFace as face, hawkerProject as project } from '@web/modules/landing/hawker-projection'
import { useId } from 'vue'

defineProps<{ motion: ReturnType<typeof communityTimeline>; cuisine: string; badge: string }>()
const artId = useId()
const paint = (name: string) => `url(#${artId}-${name})`
const assemble = (amount: number, lift = 30) => ({ opacity: amount, transform: `translateY(${lift * (1 - amount) - Math.sin(amount * Math.PI) * 4}px)` })
const box = (x: number, y: number, z: number, w: number, h: number, d: number) => ({
  front: face([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]]),
  left: face([[x,y,z],[x,y,z+d],[x,y+h,z+d],[x,y+h,z]]),
  top: face([[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]]),
})
const counter = box(-139, 12, 0, 278, 69, 65)
const slab = box(-146, 81, -7, 292, 7, 79)
const wall = box(-132, 20, 103, 264, 158, 7)
const menu = box(-112, 72, 96, 87, 53, 4)
const roof = box(-151, 198, -12, 302, 7, 137)
const base = box(-182, -8, -25, 364, 8, 170)
const stripe = (i: number) => face([[-151+i*302/8,205,-12],[-151+(i+1)*302/8,205,-12],[-151+(i+1)*302/8,205,125],[-151+i*302/8,205,125]])
const scallop = (i: number) => {
  const a=project(-151+i*302/8,198,-12), b=project(-151+(i+1)*302/8,198,-12)
  return `M${a.x} ${a.y}L${b.x} ${b.y}v13q-${(b.x-a.x)/2} 23 -${b.x-a.x} -1Z`
}
const post = (x: number) => box(x, 15, 104, 6, 183, 6)
const boardPoint = project(-69, 115, 95)
const label = project(0, 36, -1)
const bowl = (x: number, y: number, z: number, r: number) => {
 const p=project(x,y,z)
 return { x:p.x, y:p.y, r:r*.9, path:`M${p.x-r*.9} ${p.y}Q${p.x-r*.7} ${p.y+19} ${p.x} ${p.y+19}Q${p.x+r*.7} ${p.y+19} ${p.x+r*.9} ${p.y}Z` }
}
const bowls=[bowl(-103,108,19,21),bowl(-103,98,19,23)]
const tree=project(-172,0,60)
const plate=project(78,91,25)
const holder=box(109,88,23,22,26,20)
const sideWall = face([[-139,15,8],[-139,15,110],[-139,198,110],[-139,198,8]])
const fascia = box(-145,200,95,290,25,42)
const pendant = project(30,131,72)
const stool = (x:number,z:number) => ({ seat:box(x,30,z,32,5,27), legs:[box(x+2,0,z+2,4,30,4),box(x+26,0,z+2,4,30,4),box(x+2,0,z+21,4,30,4),box(x+26,0,z+21,4,30,4)] })
const stools = [stool(-185,8),stool(151,5)]
const plant = project(-151,0,-5)
</script>

<template>
  <svg class="hawker-model" viewBox="0 0 440 420" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient :id="`${artId}-sand`" x2=".6" y2="1"><stop stop-color="#fff5d8" /><stop offset="1" stop-color="#efd395" /></linearGradient>
      <linearGradient :id="`${artId}-wall`" x2="1" y2="1"><stop stop-color="#f4f4d4" /><stop offset=".5" stop-color="#d9e8b5" /><stop offset="1" stop-color="#a6c989" /></linearGradient>
      <linearGradient :id="`${artId}-wood`" x2=".3" y2="1"><stop stop-color="#ffd08a" /><stop offset=".55" stop-color="#eda65d" /><stop offset="1" stop-color="#d98540" /></linearGradient>
      <linearGradient :id="`${artId}-roof`" x2=".2" y2="1"><stop stop-color="#ffe995" /><stop offset=".5" stop-color="#ffcf58" /><stop offset="1" stop-color="#eab14a" /></linearGradient>
      <linearGradient :id="`${artId}-coral`" x2=".2" y2="1"><stop stop-color="#f99a6b" /><stop offset="1" stop-color="#dc6545" /></linearGradient>
      <linearGradient :id="`${artId}-ceramic`" x2=".3" y2="1"><stop stop-color="#fffdf0" /><stop offset=".65" stop-color="#f3e7c7" /><stop offset="1" stop-color="#d6c8a6" /></linearGradient>
      <linearGradient :id="`${artId}-metal`"><stop stop-color="#b1b0a0" /><stop offset=".35" stop-color="#e2decd" /><stop offset=".7" stop-color="#b7b5a4" /><stop offset="1" stop-color="#8b8d7b" /></linearGradient>
      <linearGradient :id="`${artId}-rail`" x2="0" y2="1"><stop stop-color="#c49251" /><stop offset=".5" stop-color="#a4733f" /><stop offset="1" stop-color="#78552e" /></linearGradient>
      <radialGradient :id="`${artId}-leaves`" cx=".3" cy=".2" r=".9"><stop stop-color="#9fcd63" /><stop offset=".5" stop-color="#62ad50" /><stop offset="1" stop-color="#2f8f4b" /></radialGradient>
      <pattern :id="`${artId}-paper`" width="23" height="19" patternUnits="userSpaceOnUse"><path d="m3 7 2-1m10 9 2 1m3-15 1 2" stroke="#a1763d" stroke-width=".7" opacity=".15" /><circle cx="9" cy="3" r="1.4" fill="#fffdf1" opacity=".45" /></pattern>
      <radialGradient :id="`${artId}-warm-light`"><stop stop-color="#fff3a7" stop-opacity=".9" /><stop offset="1" stop-color="#ffe69b" stop-opacity="0" /></radialGradient>
      <linearGradient :id="`${artId}-pillar`"><stop stop-color="#536f39" /><stop offset=".4" stop-color="#78954d" /><stop offset="1" stop-color="#4d6b3b" /></linearGradient>
      <linearGradient :id="`${artId}-counter-side`"><stop stop-color="#ae6037" /><stop offset="1" stop-color="#cd8547" /></linearGradient>
    </defs>

    <ellipse cx="230" cy="393" rx="183" ry="19" fill="#795b3820" :opacity="motion.base" />
    <g class="hawker-part" data-stall-layer="ground" :style="assemble(motion.base)">
      <polygon :points="base.front" fill="#d9b776" stroke="#d9b776" stroke-width="12" stroke-linejoin="round" />
      <polygon :points="base.left" fill="#c7a369" stroke="#c7a369" stroke-width="12" stroke-linejoin="round" />
      <polygon :points="base.top" :fill="paint('sand')" stroke="#fff5d7" stroke-width="9" stroke-linejoin="round" />
      <ellipse :cx="tree.x" :cy="tree.y" rx="26" ry="11" fill="#bed58a" />
      <ellipse :cx="project(166,0,82).x" :cy="project(166,0,82).y" rx="25" ry="9" fill="#c8dd94" />
      <polygon :points="base.top" :fill="paint('paper')" />
      <ellipse cx="242" cy="373" rx="134" ry="15" fill="#7e794924" />
    </g>
    <g class="hawker-part" data-stall-layer="walls" :style="assemble(motion.walls)">
      <polygon :points="sideWall" fill="#d9c9a6" stroke="#c5b690" stroke-width="2" stroke-linejoin="round" />
      <path v-for="i in 8" :key="`side-tile-${i}`" :d="`M${face([[-140,20+i*20,10],[-140,20+i*20,109]]).replace(' ','L')}`" stroke="#b8a98b" stroke-width="1" opacity=".6" />
      <polygon :points="fascia.left" fill="#bd8b37" /><polygon :points="fascia.front" fill="#dfb851" /><polygon :points="fascia.top" fill="#f7d18a" stroke="#f8ddb0" stroke-width="5" stroke-linejoin="round" />
      <polygon :points="wall.left" fill="#8ca66e" /><polygon :points="wall.front" :fill="paint('wall')" stroke="#a6ba82" stroke-width="3" stroke-linejoin="round" />
      <path v-for="i in 5" :key="`tile-h-${i}`" :d="`M${face([[-130,35+i*25,102],[130,35+i*25,102]]).replace(' ','L')}`" stroke="#a6bd83" stroke-width="1.3" fill="none" opacity=".45" />
      <path v-for="i in 7" :key="`tile-v-${i}`" :d="`M${face([[-130+i*33,22,102],[-130+i*33,178,102]]).replace(' ','L')}`" stroke="#a6bd83" stroke-width="1.3" fill="none" opacity=".35" />
      <ellipse :cx="pendant.x" :cy="pendant.y+8" rx="95" ry="64" :fill="paint('warm-light')" />
      <g v-for="x in [-139,133]" :key="x"><polygon :points="post(x).front" fill="#85a469" /><polygon :points="post(x).left" fill="#6c8d55" /><polygon :points="post(x).top" fill="#bdd398" /></g>
      <g v-for="x in [-145,133]" :key="`front-post-${x}`"><polygon :points="box(x,12,8,12,186,12).left" fill="#456235" /><polygon :points="box(x,12,8,12,186,12).front" :fill="paint('pillar')" /><polygon :points="box(x,12,8,12,186,12).top" fill="#98ae69" /></g>
      <polygon :points="menu.left" fill="#9d865d" /><polygon :points="menu.front" fill="#fff7db" stroke="#c6ae7c" stroke-width="2.5" stroke-linejoin="round" />
      <text :x="boardPoint.x" :y="boardPoint.y" text-anchor="middle" font-size="8" font-weight="800" fill="#7b6240" :transform="`rotate(2.23 ${boardPoint.x} ${boardPoint.y})`">TODAY'S MENU</text>
      <path v-for="i in 3" :key="i" :d="`M${face([[-100,118-i*10,95],[-40+(i%2)*8,118-i*10,95]]).replace(' ','L')}`" stroke="#c6ad7a" stroke-width="2.5" stroke-linecap="round" />
      <path :d="`M${face([[0,155,99],[116,155,99]]).replace(' ','L')}`" stroke="#7c965d" stroke-width="4" stroke-linecap="round" />
      <g v-for="(x,i) in [20,58,96]" :key="x"><path :d="`M${face([[x,155,96],[x,116,96]]).replace(' ','L')}`" stroke="#968267" stroke-width="2.5" /><ellipse v-if="i===0" :cx="project(x,108,96).x" :cy="project(x,108,96).y" rx="5" ry="8" :fill="paint('metal')" /><rect v-else :x="project(x,116,96).x-5" :y="project(x,116,96).y" width="10" height="16" rx="2" :fill="paint('metal')" /></g>
    </g>
    <g class="hawker-part" data-stall-layer="counter" :style="assemble(motion.counter)">
      <polygon :points="counter.left" :fill="paint('counter-side')" stroke="#b98654" stroke-width="4" stroke-linejoin="round" />
      <polygon :points="counter.front" :fill="paint('wood')" stroke="#ffebbc" stroke-width="4" stroke-linejoin="round" />
      <polygon :points="face([[-130,20,-1],[130,20,-1],[130,73,-1],[-130,73,-1]])" fill="none" stroke="#ffe3aa" stroke-width="2" stroke-linejoin="round" />
      <polygon :points="counter.front" :fill="paint('paper')" />
      <path :d="`M${face([[-119,37,-2],[-91,37,-2]]).replace(' ','L')} M${face([[90,37,-2],[118,37,-2]]).replace(' ','L')}`" stroke="#ffe8b9" stroke-width="2.5" stroke-linecap="round" />
      <polygon :points="slab.left" fill="#c3925b" /><polygon :points="slab.front" fill="#dab079" stroke="#dab079" stroke-width="3" stroke-linejoin="round" /><polygon :points="slab.top" fill="#fff5d9" stroke="#fff5d9" stroke-width="4" stroke-linejoin="round" />
      <text :x="label.x" :y="label.y" text-anchor="middle" font-family="Lobang Pop, sans-serif" font-size="11" font-weight="900" fill="#8b603b" :transform="`rotate(2.23 ${label.x} ${label.y})`">FRESH LOBANGS</text>
    </g>
    <g class="hawker-part hawker-awning" data-stall-layer="awning" :style="assemble(motion.awning,-35)">
      <g v-for="x in [-85,85]" :key="`sign-lamp-${x}`">
        <path :d="`M${face([[x,302,105],[x,329,105],[x+8,342,105],[x+28,342,105]]).replaceAll(' ','L')}`" stroke="#705c42" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <polygon :points="box(x+8,338,102,31,5,14).front" fill="#8b7453" stroke="#80684b" stroke-width="2" stroke-linejoin="round" /><polygon :points="box(x+8,338,102,31,5,14).top" fill="#a08b66" />
        <path :d="`M${face([[x+12,336,101],[x+36,336,101]]).replace(' ','L')}`" stroke="#ffe5a0" stroke-width="2" stroke-linecap="round" />
      </g>
      <path v-for="x in [-85,85]" :key="`sign-mount-${x}`" :d="`M${face([[x,207,105],[x,254,105]]).replace(' ','L')}`" stroke="#647646" stroke-width="5" stroke-linecap="round" />
      <polygon :points="roof.left" fill="#c68c45" /><polygon :points="roof.front" fill="#dca451" />
      <polygon v-for="i in 8" :key="`stripe-${i}`" :points="stripe(i-1)" :fill="paint(i%2?'coral':'roof')" />
      <polygon :points="roof.top" :fill="paint('paper')" />
      <path v-for="i in 8" :key="`trim-${i}`" :d="scallop(i-1)" :fill="paint(i%2?'coral':'roof')" />
      <path :d="`M${face([[-151,198,-12],[151,198,-12]]).replace(' ','L')}`" stroke="#ffe5a0" stroke-width="2" />
      <path :d="`M${face([[-151,207,125],[151,207,125]]).replace(' ','L')}`" :stroke="paint('rail')" stroke-width="6" stroke-linecap="round" />
    </g>
    <g class="hawker-part" data-stall-layer="food" :style="assemble(motion.food,16)">
      <path :d="`M${face([[30,177,72],[30,143,72]]).replace(' ','L')}`" stroke="#66543b" stroke-width="2" />
      <path :d="`M${pendant.x-13} ${pendant.y}q0-21 13-21t13 21Z`" :fill="paint('coral')" stroke="#dc8653" stroke-width="1" />
      <ellipse :cx="pendant.x" :cy="pendant.y" rx="13" ry="3" fill="#fff1b0" />
      <!-- Empty glass service display: deliberately independent of a food category. -->
      <polygon :points="box(62,88,46,66,58,22).front" fill="#d7eee0" fill-opacity=".18" stroke="#aaa995" stroke-width="2" />
      <polygon :points="box(62,88,46,66,58,22).left" fill="#dce8dc" fill-opacity=".16" stroke="#a5a48f" stroke-width="2" />
      <polygon :points="box(60,146,44,70,4,26).top" :fill="paint('metal')" /><polygon :points="box(60,146,44,70,4,26).front" fill="#b9b6a1" />
      <path :d="`M${face([[63,115,47],[127,115,47]]).replace(' ','L')}`" stroke="#c6c4ae" stroke-width="2" />
      <path :d="`M${face([[67,94,47],[67,139,47]]).replace(' ','L')}`" stroke="#fff9e0" stroke-width="1.5" opacity=".6" />
      <g v-for="(b,i) in bowls" :key="i"><path :d="b.path" :fill="paint('ceramic')" stroke="#cbbc98" stroke-width="1" /><ellipse :cx="b.x" :cy="b.y" :rx="b.r" :ry="b.r*.35" fill="#fff9e7" stroke="#d8c9a3" /></g>
      <ellipse v-for="i in 4" :key="`plate-${i}`" :cx="plate.x" :cy="plate.y-i*3" rx="16" ry="5.5" :fill="paint('ceramic')" stroke="#d1c09a" stroke-width="1" />
      <path v-for="i in 4" :key="`stick-${i}`" :d="`M${face([[111+i*4,110,28],[106+i*7,141,28]]).replace(' ','L')}`" stroke="#d87c52" stroke-width="2.7" stroke-linecap="round" />
      <polygon :points="holder.left" fill="#a3a18b" /><polygon :points="holder.front" :fill="paint('metal')" stroke="#aeaa93" stroke-width="1" /><polygon :points="holder.top" fill="#d7d1ba" />
      <g v-for="(x,i) in [-53,-36]" :key="`sauce-${x}`">
        <polygon :points="box(x,88,20,11,22,11).front" :fill="i ? '#73523a' : paint('coral')" stroke="#c28b57" stroke-width=".6" />
        <polygon :points="box(x+3,110,23,5,8,5).front" fill="#e7b57a" />
        <polygon :points="box(x+3,117,23,5,3,5).top" fill="#db7852" />
      </g>
      <ellipse :cx="project(52,89,3).x" :cy="project(52,89,3).y" rx="10" ry="4" :fill="paint('ceramic')" stroke="#cdbc94" /><ellipse :cx="project(52,90,3).x" :cy="project(52,90,3).y" rx="7" ry="2" fill="#b97544" />
      <!-- The selected photograph sits on this counter-mounted menu stand. -->
      <polygon :points="box(-26,88,16,52,2,22).top" fill="#b7a37a" />
      <polygon :points="box(-3,89,25,6,32,5).front" fill="#b7a37a" />
    </g>
    <g class="hawker-part" data-stall-layer="greenery" :style="assemble(motion.decor,14)">
      <path :d="`M${tree.x} ${tree.y}v-53`" stroke="#8c633c" stroke-width="4" stroke-linecap="round" />
      <path :d="`M${tree.x-15} ${tree.y-24}q-23-5-17-24q-4-16 14-20q13-18 27-4q23-5 25 16q12 22-10 31Z`" :fill="paint('leaves')" />
      <path :d="`M${tree.x} ${tree.y-12}v-32m0 15-13-10m13 0 13-10`" stroke="#80623a" stroke-width="2.5" fill="none" stroke-linecap="round" />
      <ellipse v-for="(x,i) in [-171,-153,166,182]" :key="x" :cx="project(x,3,68+i*4).x" :cy="project(x,3,68+i*4).y" rx="9" ry="7" fill="#9fbe6e" />
      <g v-for="(item,i) in stools" :key="`stool-${i}`">
        <g v-for="(leg,j) in item.legs" :key="j"><polygon :points="leg.left" fill="#a45237" /><polygon :points="leg.front" :fill="paint('coral')" /></g>
        <polygon :points="item.seat.left" fill="#b65d3f" /><polygon :points="item.seat.front" fill="#dc7852" /><polygon :points="item.seat.top" :fill="paint('coral')" stroke="#e79165" stroke-width="1.5" stroke-linejoin="round" />
      </g>
      <path :d="`M${plant.x-11} ${plant.y-22}h22l-4 22q-7 6-14 0Z`" :fill="paint('ceramic')" stroke="#d1b78a" stroke-width="1" /><ellipse :cx="plant.x" :cy="plant.y-22" rx="12" ry="4" fill="#ecdeb9" />
      <path :d="`M${plant.x} ${plant.y-24}v-29`" stroke="#6c7b3e" stroke-width="2" />
      <g :fill="paint('leaves')"><ellipse :cx="plant.x-7" :cy="plant.y-34" rx="11" ry="5" transform-origin="center" /><ellipse :cx="plant.x+8" :cy="plant.y-43" rx="11" ry="5" /><ellipse :cx="plant.x-5" :cy="plant.y-51" rx="7" ry="11" /><ellipse :cx="plant.x+4" :cy="plant.y-58" rx="5" ry="9" /></g>
      <circle :cx="project(147,143,98).x" :cy="project(147,143,98).y" r="14" fill="#fff0b6" stroke="#cbb071" stroke-width="2" /><text :x="project(147,143,98).x" :y="project(147,143,98).y+4" text-anchor="middle" font-size="13" fill="#94723e">✦</text>
    </g>
  </svg>
</template>
