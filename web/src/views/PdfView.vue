<script setup>
// PDF half of the reader. epub.js can't render PDFs, so this is a separate
// renderer behind the same shell: same bookmark column (last_loc holds the page
// number as a string), same full-screen chrome, same keys.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const props = defineProps({
  src: { type: String, required: true },
  startPage: { type: [String, Number], default: 1 },
});
const emit = defineEmits(['located', 'error']);

const canvasRef = ref(null);
const wrapRef = ref(null);
const page = ref(Math.max(1, parseInt(props.startPage, 10) || 1));
const pageCount = ref(0);
const loading = ref(true);
const zoom = ref(1);                 // multiplier on top of fit-to-width

let doc = null;
let renderTask = null;
let ro = null;
let queued = false;

async function load() {
  try {
    doc = await pdfjs.getDocument({ url: props.src, withCredentials: true }).promise;
    pageCount.value = doc.numPages;
    if (page.value > pageCount.value) page.value = pageCount.value;
    await draw();
  } catch (e) {
    emit('error', e?.message || 'Could not open PDF');
  } finally {
    loading.value = false;
  }
}

async function draw() {
  if (!doc || !canvasRef.value || !wrapRef.value) return;
  // Only one render may touch a canvas at a time; pdf.js throws otherwise.
  if (renderTask) { try { renderTask.cancel(); } catch {} renderTask = null; }

  const p = await doc.getPage(page.value);
  const base = p.getViewport({ scale: 1 });
  const avail = wrapRef.value.clientWidth || 1;
  // Fit to width, then apply the user's zoom. Cap the device pixel ratio: a 3x
  // phone screen on an A4 page allocates a canvas big enough to be dropped.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = (avail / base.width) * zoom.value;
  const viewport = p.getViewport({ scale: scale * dpr });

  const canvas = canvasRef.value;
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
  canvas.style.height = Math.floor(viewport.height / dpr) + 'px';

  renderTask = p.render({ canvasContext: canvas.getContext('2d'), viewport });
  try { await renderTask.promise; } catch { /* cancelled by a newer draw */ }
  renderTask = null;
  emit('located', String(page.value));
}

// Redrawing on every resize event during a drag is wasteful and flickers, and
// rAF-coalescing is enough: one draw per frame at most.
function scheduleDraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; draw(); });
}

function next() { if (page.value < pageCount.value) { page.value++; } }
function prev() { if (page.value > 1) { page.value--; } }
function zoomIn()  { zoom.value = Math.min(3, zoom.value + 0.2); }
function zoomOut() { zoom.value = Math.max(0.5, zoom.value - 0.2); }
function goTo(n) {
  const v = Math.min(pageCount.value, Math.max(1, parseInt(n, 10) || 1));
  page.value = v;
}

watch([page, zoom], scheduleDraw);

onMounted(() => {
  load();
  ro = new ResizeObserver(scheduleDraw);
  if (wrapRef.value) ro.observe(wrapRef.value);
});

onBeforeUnmount(() => {
  try { ro?.disconnect(); } catch {}
  try { renderTask?.cancel(); } catch {}
  try { doc?.destroy(); } catch {}
});

defineExpose({ next, prev, zoomIn, zoomOut, goTo, page, pageCount });
</script>

<template>
  <div ref="wrapRef" class="pdfwrap">
    <p v-if="loading" class="muted small" style="padding:12px">Opening PDF…</p>
    <canvas ref="canvasRef" class="pdfcanvas"></canvas>
  </div>
</template>

<style scoped>
.pdfwrap { width: 100%; height: 100%; overflow: auto; background: #fdfaf2; text-align: center; }
.pdfcanvas { display: block; margin: 0 auto; }
</style>
