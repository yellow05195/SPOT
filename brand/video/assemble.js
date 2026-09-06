// Assembles the teaser: opening card → 4 street clips → closing card, cross-faded, music under,
// the clips' own street ambience mixed low. Output: brand/video/spot-teaser.mp4 (1080×1920, 24 fps).
//   node brand/video/assemble.js   (from the repository root)
const { execFileSync } = require("child_process");
const path = require("path");
const ffmpeg = require("../../app/node_modules/ffmpeg-static");
const dir = __dirname;

// [file, start, duration, hasAudio]
const shots = [
  ["clip-open.mp4", 0, 4, false],
  ["clip1.mp4", 0.8, 6, true],
  ["clip2.mp4", 0.8, 6, true],
  ["clip3.mp4", 0.8, 6, true],
  ["clip4.mp4", 0.4, 6, true],
  ["clip-close.mp4", 0, 5, false],
];
const XF = 0.45; // cross-fade length
const inputs = shots.flatMap(([f]) => ["-i", path.join(dir, f)]);
inputs.push("-i", path.join(dir, "music.wav"));
const musicIdx = shots.length;

let filter = "";
// trimmed, normalised video streams
shots.forEach(([, start, dur], i) => {
  filter += `[${i}:v]trim=start=${start}:duration=${dur},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24,format=yuv420p[v${i}];`;
});
// chain of cross-fades
let last = "v0";
let offset = 0;
shots.forEach(([, , dur], i) => {
  if (i === 0) {
    offset = dur - XF;
    return;
  }
  const out = i === shots.length - 1 ? "vout" : `x${i}`;
  filter += `[${last}][v${i}]xfade=transition=fade:duration=${XF}:offset=${offset.toFixed(3)}[${out}];`;
  last = out;
  offset += dur - XF;
});
const total = offset + XF;
// street ambience from the clips, placed at their offsets, mixed low under the music
let t = 0;
const amb = [];
shots.forEach(([, start, dur, hasAudio], i) => {
  if (hasAudio) {
    filter += `[${i}:a]atrim=start=${start}:duration=${dur},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st=${dur - 0.5}:d=0.5,volume=0.22,adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[a${i}];`;
    amb.push(`[a${i}]`);
  }
  t += dur - XF;
});
filter += `[${musicIdx}:a]atrim=duration=${total.toFixed(2)},afade=t=in:d=0.6,afade=t=out:st=${(total - 2.2).toFixed(2)}:d=2.2,volume=0.9[music];`;
filter += `${amb.join("")}[music]amix=inputs=${amb.length + 1}:duration=first:normalize=0[aout]`;

const out = path.join(dir, "spot-teaser.mp4");
const args = [...inputs, "-filter_complex", filter, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-y", out];
execFileSync(ffmpeg, args, { stdio: ["ignore", "inherit", "inherit"] });
console.log(`wrote ${out} (${total.toFixed(1)} s)`);
