import { AfterViewInit, Component, ElementRef, effect, input, OnDestroy, viewChild } from '@angular/core';
import {
  AmbientLight,
  ArrowHelper,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Euler,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cubePose, ReplayTrace } from './shot-replay';

const DEG = Math.PI / 180;
/** Half the width of the space in degrees at magnification 1 (as the 2D views). */
const VIEW_DEG = 20;
/** Half the width of the space in scene units. */
const SPACE = 2;

/**
 * The shot in 3D: a box for the bow's handle (the bright face is the top, the blue face
 * points at the target) that moves up/down and left/right in the space and turns. The
 * archer looks from behind (+z) toward the target (−z); x is right and y is up.
 */
@Component({
  selector: 'app-replay-cube',
  template: `<div class="host" #host></div>`,
  styles: `
    .host {
      width: 100%;
      aspect-ratio: 4 / 3;
      max-height: 520px;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      touch-action: none;
    }
  `,
})
export class ReplayCube implements AfterViewInit, OnDestroy {
  readonly trace = input.required<ReplayTrace>();
  readonly index = input.required<number>();
  /** Magnification of the movement and of the box's turn. */
  readonly magMove = input(5);
  readonly magTurn = input(2);
  readonly others = input<ReplayTrace[]>([]);
  readonly showOthers = input(false);

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private renderer?: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(40, 4 / 3, 0.1, 100);
  private controls?: OrbitControls;
  private box = new Group();
  private trail = new Line(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true }));
  private otherLines = new Group();
  private resize?: ResizeObserver;
  private colors: Record<string, Color> = {};

  constructor() {
    effect(() => {
      // Redraw whenever the shot, time or settings change
      this.trace();
      this.index();
      this.magMove();
      this.magTurn();
      this.others();
      this.showOthers();
      this.update();
    });
  }

  ngAfterViewInit(): void {
    const host = this.host().nativeElement;
    const css = getComputedStyle(host);
    const color = (name: string, fallback: string) => new Color(css.getPropertyValue(name).trim() || fallback);
    this.colors = {
      early: color('--muted', '#94a3b8'),
      last: color('--accent', '#3182ce'),
      final: color('--warn', '#d69e2e'),
      after: color('--danger', '#c53030'),
    };
    this.scene.background = color('--panel', '#1a2029');

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(this.renderer.domElement);

    // Seen from behind the archer, a little from above and to the right
    this.camera.position.set(1.8, 1.0, 8.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener('change', () => this.render());

    this.scene.add(new AmbientLight(0xffffff, 0.8));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 6);
    this.scene.add(sun);

    // Back wall (where the bow points, like the target) and floor
    const wall = new GridHelper(SPACE * 2, 8, color('--muted', '#94a3b8'), color('--border', '#2d3745'));
    wall.rotation.x = Math.PI / 2;
    wall.position.z = -1.2;
    this.scene.add(wall);
    const floor = new GridHelper(SPACE * 2, 8, color('--border', '#2d3745'), color('--border', '#2d3745'));
    floor.position.y = -SPACE;
    this.scene.add(floor);

    // The handle: right/left sides grey, top bright, bottom dark, front (target) blue, back (archer) light
    const faces = [0x8a94a3, 0x8a94a3, 0xf2f2f2, 0x3a4250, 0xc9d1db, 0x3182ce].map((c) => new MeshLambertMaterial({ color: c }));
    const geo = new BoxGeometry(0.35, 1.1, 0.35);
    this.box.add(new Mesh(geo, faces));
    this.box.add(new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: 0x111111 })));
    // Where the bow points
    this.box.add(new ArrowHelper(new Vector3(0, 0, -1), new Vector3(0, 0, -0.18), 1.1, 0x3182ce, 0.18, 0.1));
    this.scene.add(this.box);
    this.scene.add(this.trail);
    this.scene.add(this.otherLines);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.update();
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }

  private fit(): void {
    const host = this.host().nativeElement;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!this.renderer || !w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  /** Scene position of a pose's up/right (degrees). */
  private position(up: number, right: number): Vector3 {
    const k = SPACE / (VIEW_DEG / this.magMove());
    return new Vector3(right * k, up * k, 0);
  }

  private phase(t: number): Color {
    return t < -1000 ? this.colors['early'] : t < -200 ? this.colors['last'] : t < 0 ? this.colors['final'] : this.colors['after'];
  }

  private update(): void {
    if (!this.renderer) return;
    const tr = this.trace();
    const i = Math.max(0, Math.min(tr.t.length - 1, this.index()));
    const pose = cubePose(tr, i);
    this.box.position.copy(this.position(pose.up, pose.right));
    // Yaw (right is −y rotation), then tip (up is +x rotation), then cant (top right is −z rotation)
    const m = this.magTurn();
    this.box.rotation.copy(new Euler(pose.tip * m * DEG, -pose.twist * m * DEG, -pose.cant * m * DEG, 'YXZ'));

    // Trail up to now, coloured by phase
    const pts: number[] = [];
    const cols: number[] = [];
    for (let k = 0; k <= i; k++) {
      const p = cubePose(tr, k);
      const v = this.position(p.up, p.right);
      pts.push(v.x, v.y, v.z);
      const c = this.phase(tr.t[k]);
      cols.push(c.r, c.g, c.b);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    this.trail.geometry.dispose();
    this.trail.geometry = g;

    // Other shots, faint, up to the same time before/after their release
    for (const child of [...this.otherLines.children]) {
      (child as Line).geometry.dispose();
      this.otherLines.remove(child);
    }
    if (this.showOthers()) {
      const now = tr.t[i];
      const mat = new LineBasicMaterial({ color: this.colors['early'], transparent: true, opacity: 0.3 });
      for (const o of this.others()) {
        if (o.shotId === tr.shotId) continue;
        const op: number[] = [];
        for (let k = 0; k < o.t.length && o.t[k] <= now; k++) {
          const p = cubePose(o, k);
          const v = this.position(p.up, p.right);
          op.push(v.x, v.y, v.z);
        }
        if (op.length < 6) continue;
        const og = new BufferGeometry();
        og.setAttribute('position', new BufferAttribute(new Float32Array(op), 3));
        this.otherLines.add(new Line(og, mat));
      }
    }
    this.render();
  }

  private render(): void {
    this.renderer?.render(this.scene, this.camera);
  }
}
