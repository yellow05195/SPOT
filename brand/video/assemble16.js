// The 16:9 cut for X (1920×1080, 24 fps): real screen recordings of the product between candid
// street clips, a voice-over, music ducked under the voice, the clips' ambience low, and sound
// design on the shutter, the earned card and the cuts. Output: brand/video/spot-teaser-x.mp4
//   node brand/video/assemble16.js   (from the repository root)
const { execFileSync } = require("child_process");
const path = require("path");
const ffmpeg = require("../../app/node_modules/ffmpeg-static");
const dir = __dirname;
const p = (f) => path.join(dir, f);

// [file, start, duration, kind]   kind: wide (16:9 footage) | phone (portrait recording, framed) | still (image)
const shots = [
  ["app-hero.mp4", 0.6, 2.6, "wide", false],
  ["w1.mp4", 0.3, 4.6, "wide", true],
  ["app-lens.mp4", 1.6, 10.0, "phone", false],
  ["w2.mp4", 0.2, 4.0, "wide", true],
  ["app-map.mp4", 1.0, 4.6, "wide", false],
  ["w3.mp4", 0.2, 4.0, "wide", true],
  ["wcard-close.png", 0, 4.6, "still", false],
];
const XF = 0.35;
const inputs = [];
const idx = {};
shots.forEach(([f], i) => {
  idx[i] = inputs.length / 2;
  if (f.endsWith(".png")) inputs.push("-loop", "1", "-t", String(shots[i][2] + 1), "-i", p(f));
  else inputs.push("-i", p(f));
});
const add = (name, f) => {
  idx[name] = inputs.filter((x) => x === "-i").length;
  inputs.push("-i", p(f));
};
// inputs above with -loop use "-loop 1 -t N -i" so count "-i" occurrences for indices
shots.forEach((s, i) => (idx[i] = inputs.slice(0, inputs.indexOf(p(s[0]))).filter((x) => x === "-i").length - 1));
add("mask", "mask.png");
add("rim", "rim.png");
add("w1bg", "w1.mp4");
add("music", "music.wav");
add("vo", process.env.SPOT_VO || "vo-archie.wav");
add("shutter", "sfx-shutter.wav");
add("tick", "sfx-tick.wav");
add("whoosh", "sfx-whoosh.wav");

let filter = "";
shots.forEach(([, start, dur, kind], i) => {
  const src = `[${idx[i]}:v]`;
  if (kind === "phone") {
    // the screen itself with rounded corners and a thin light rim, over the street (w1) blurred and dimmed
    filter += `${src}trim=start=${start}:duration=${dur},setpts=PTS-STARTPTS,fps=24,scale=468:1014,format=rgba[scrraw${i}];`;
    filter += `[${idx.mask}:v]crop=936:2028:0:0,alphaextract,scale=468:1014:flags=lanczos[msk${i}];`;
    filter += `[scrraw${i}][msk${i}]alphamerge[scr${i}];`;
    filter += `[${idx.w1bg}:v]trim=start=0.6:duration=${dur},setpts=PTS-STARTPTS,fps=24,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=28:2,eq=brightness=-0.25:saturation=1.05,format=rgba[bg${i}];`;
    filter += `[${idx.rim}:v]scale=472:1018:flags=lanczos[rimS${i}];[bg${i}][rimS${i}]overlay=(W-w)/2:(H-h)/2:format=rgb[bgr${i}];`;
    filter += `[bgr${i}][scr${i}]overlay=(W-w)/2:(H-h)/2:format=rgb,format=yuv420p[v${i}];`;
  } else if (kind === "still") {
    filter += `${src}trim=duration=${dur},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,format=yuv420p[v${i}];`;
  } else {
    filter += `${src}trim=start=${start}:duration=${dur},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,format=yuv420p[v${i}];`;
  }
});
let last = "v0";
let offset = shots[0][2] - XF;
const cutTimes = [];
shots.forEach(([, , dur], i) => {
  if (i === 0) return;
  const out = i === shots.length - 1 ? "vout" : `x${i}`;
  filter += `[${last}][v${i}]xfade=transition=fade:duration=${XF}:offset=${offset.toFixed(3)}[${out}];`;
  cutTimes.push(offset);
  last = out;
  offset += dur - XF;
});
const total = offset + XF;

// audio
const layers = [];
let t = 0;
shots.forEach(([, start, dur, , amb], i) => {
  if (amb) {
    filter += `[${idx[i]}:a]atrim=start=${start}:duration=${dur},asetpts=PTS-STARTPTS,afade=t=in:d=0.3,afade=t=out:st=${(dur - 0.4).toFixed(2)}:d=0.4,volume=0.3,adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[amb${i}];`;
    layers.push(`[amb${i}]`);
  }
  t += dur - XF;
});
const lensStart = cutTimes[1]; // when the phone segment begins
const shutterAt = lensStart + (4.7 - 1.6);
const cardAt = lensStart + (10.6 - 1.6);
const VO_START = 0.7;
filter += `[${idx.music}:a]atrim=duration=${total.toFixed(2)},aformat=channel_layouts=stereo,afade=t=in:d=0.5,afade=t=out:st=${(total - 2.5).toFixed(2)}:d=2.5,volume='if(between(t,${VO_START},${(VO_START + 16.0).toFixed(1)}),0.45,0.95)':eval=frame[music];`;
filter += `[${idx.vo}:a]aformat=channel_layouts=stereo,volume=1.6,adelay=${Math.round(VO_START * 1000)}|${Math.round(VO_START * 1000)}[vo];`;
filter += `[${idx.shutter}:a]aformat=channel_layouts=stereo,atrim=duration=1.2,volume=1.1,adelay=${Math.round(shutterAt * 1000)}|${Math.round(shutterAt * 1000)}[shut];`;
filter += `[${idx.tick}:a]aformat=channel_layouts=stereo,atrim=duration=1.4,volume=1.0,adelay=${Math.round(cardAt * 1000)}|${Math.round(cardAt * 1000)}[tick];`;
const whooshes = cutTimes.map((c, i) => {
  filter += `[${idx.whoosh}:a]aformat=channel_layouts=stereo,atrim=duration=0.7,volume=0.35,adelay=${Math.round((c - 0.15) * 1000)}|${Math.round((c - 0.15) * 1000)}[wh${i}];`;
  return `[wh${i}]`;
});
// the whoosh input is used several times: split it first
filter = filter.replace(new RegExp(`\\[${idx.whoosh}:a\\]aformat`, "g"), "[whsrc]aformat");
filter = `[${idx.whoosh}:a]asplit=${whooshes.length}${whooshes.map((_, i) => `[whs${i}]`).join("")};` + filter;
whooshes.forEach((_, i) => (filter = filter.replace("[whsrc]aformat", `[whs${i}]aformat`)));
const all = [...layers, "[music]", "[vo]", "[shut]", "[tick]", ...whooshes];
filter += `${all.join("")}amix=inputs=${all.length}:duration=longest:normalize=0,atrim=duration=${total.toFixed(2)},alimiter=limit=0.95[aout]`;

const out = p("spot-teaser-x.mp4");
const args = [...inputs, "-filter_complex", filter, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", total.toFixed(2), "-y", out];
execFileSync(ffmpeg, args, { stdio: ["ignore", "inherit", "inherit"] });
console.log(`wrote ${out} (${total.toFixed(1)} s); cuts at ${cutTimes.map((c) => c.toFixed(1)).join(", ")}; shutter ${shutterAt.toFixed(1)}s, card ${cardAt.toFixed(1)}s`);
