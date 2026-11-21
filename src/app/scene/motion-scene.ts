import { Component, ElementRef, OnDestroy, afterNextRender, input, viewChild } from '@angular/core';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SensorRole } from '../sensors/sensor.model';
import { createBow, createHead, createMarker } from './models';

/** Where each role's model sits in the scene (archer standing at origin, target along -Z). */
const ROLE_POSITIONS: Record<SensorRole, Vector3> = {
  bow: new Vector3(0, 1.4, -0.65),
  head: new Vector3(0, 1.6, 0.05),
  torso: new Vector3(0, 1.25, 0.1),
  bowArm: new Vector3(0, 1.45, -0.3),
  drawArm: new Vector3(0.15, 1.45, 0.2),
  other: new Vector3(0.4, 1.2, 0),
};

/** Extra bow sensors are drawn this far to the right of the first (m). */
export const BOW_SPACING = 0.35;

const TRAIL_POINTS = 600;
const AIM_DISTANCE = 2; // metres in front of the bow for the aim-trace

/** One model to draw. Orientation and offset are in scene coordinates (Y up, target along -Z). */
export interface ScenePose {
  /** Stable identity, so the model is reused between frames. */
  key: unknown;
  role: SensorRole;
  quaternion?: Quaternion;
  /** Translation from the role's default position, in metres. */
  offset?: Vector3;
}

/** 'aim' traces where the arrow points; 'grip' traces the bow's own path. */
export type TrailMode = 'aim' | 'grip';

interface Rendered {
  role: SensorRole;
  object: Group;
}

@Component({
  selector: 'app-motion-scene',
  template: `<canvas #canvas></canvas>`,
  styles: `
    :host { display: block; position: relative; width: 100%; height: 100%; min-height: 300px; }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  `,
})
export class MotionScene implements OnDestroy {
  /** Called every animation frame to get the current poses. */
  readonly poses = input.required<() => ScenePose[]>();
  readonly showTrail = input(true);
  readonly trailMode = input<TrailMode>('aim');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
  private resizeObserver?: ResizeObserver;
  private frame = 0;
  private readonly rendered = new Map<unknown, Rendered>();

  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, 1, 0.01, 100);
  private readonly trailPositions = new Float32Array(TRAIL_POINTS * 3);
  private trailCount = 0;
  private trail?: Line;
  private readonly tmpV = new Vector3();

  constructor() {
    afterNextRender(() => this.init());
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
  }

  clearTrail(): void {
    this.trailCount = 0;
  }

  /** Camera directly behind the bow, looking towards the target (archer's view). */
  resetView(): void {
    if (!this.controls) return;
    const bow = ROLE_POSITIONS.bow;
    this.camera.position.set(bow.x, bow.y + 0.1, bow.z + 2.8);
    this.controls.target.set(bow.x, bow.y, bow.z);
    this.controls.update();
  }

  private init(): void {
    const canvas = this.canvas().nativeElement;
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene.background = new Color(0x1e2530);
    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.scene.add(new GridHelper(4, 20, 0x556070, 0x343c48));

    const trailGeom = new BufferGeometry();
    trailGeom.setAttribute('position', new BufferAttribute(this.trailPositions, 3));
    this.trail = new Line(trailGeom, new LineBasicMaterial({ color: 0xf6e05e }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);

    this.controls = new OrbitControls(this.camera, canvas);
    this.resetView();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement!);
    this.resize();

    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.update();
      this.renderer!.render(this.scene, this.camera);
    };
    loop();
  }

  private resize(): void {
    const host = this.canvas().nativeElement.parentElement!;
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h || !this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private update(): void {
    const poses = this.poses()();
    const keys = new Set(poses.map((p) => p.key));

    for (const [key, r] of this.rendered) {
      if (!keys.has(key)) {
        this.scene.remove(r.object);
        this.rendered.delete(key);
      }
    }

    let bowObject: Group | undefined;
    for (const pose of poses) {
      let r = this.rendered.get(pose.key);
      if (!r || r.role !== pose.role) {
        if (r) this.scene.remove(r.object);
        const object = pose.role === 'bow' ? createBow() : pose.role === 'head' ? createHead() : createMarker();
        this.scene.add(object);
        r = { role: pose.role, object };
        this.rendered.set(pose.key, r);
      }
      r.object.position.copy(ROLE_POSITIONS[pose.role]);
      if (pose.offset) r.object.position.add(pose.offset);
      if (pose.quaternion) r.object.quaternion.copy(pose.quaternion);
      if (pose.role === 'bow' && !bowObject) bowObject = r.object; // trail follows the first bow
    }

    this.updateTrail(bowObject);
  }

  private updateTrail(bow: Group | undefined): void {
    if (!this.trail) return;
    this.trail.visible = !!bow && this.showTrail();
    if (!bow) return;

    const p =
      this.trailMode() === 'aim'
        ? this.tmpV.set(0, 0, -AIM_DISTANCE).applyQuaternion(bow.quaternion).add(bow.position)
        : this.tmpV.copy(bow.position);
    if (this.trailCount === TRAIL_POINTS) {
      this.trailPositions.copyWithin(0, 3);
      this.trailCount--;
    }
    this.trailPositions.set([p.x, p.y, p.z], this.trailCount * 3);
    this.trailCount++;
    const geom = this.trail.geometry;
    geom.setDrawRange(0, this.trailCount);
    geom.attributes['position'].needsUpdate = true;
  }
}
