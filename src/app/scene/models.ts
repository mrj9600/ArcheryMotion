import {
  AxesHelper,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';

/**
 * Recurve bow, origin at the grip. Rest pose: bow vertical (+Y up),
 * aiming along -Z (towards target), string on +Z side (towards archer).
 * Units are metres.
 */
export function createBow(): Group {
  const bow = new Group();
  const riserMat = new MeshStandardMaterial({ color: 0x2b6cb0, metalness: 0.5, roughness: 0.4 });
  const limbMat = new MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });

  const riser = new Mesh(new BoxGeometry(0.035, 0.64, 0.05), riserMat);
  bow.add(riser);

  const tips: Vector3[] = [];
  for (const dir of [1, -1]) {
    const start = new Vector3(0, 0.32 * dir, 0);
    const ctrl = new Vector3(0, 0.55 * dir, 0.14);
    const end = new Vector3(0, 0.82 * dir, 0.05);
    const curve = new QuadraticBezierCurve3(start, ctrl, end);
    bow.add(new Mesh(new TubeGeometry(curve, 24, 0.012, 8, false), limbMat));
    tips.push(end);
  }

  // String: brace height ~22 cm
  const stringMat = new LineBasicMaterial({ color: 0xeeeeee });
  bow.add(new Line(new BufferGeometry().setFromPoints([tips[0], tips[1]]), stringMat));

  // Arrow at rest (from string to beyond the riser)
  const arrow = new Mesh(new CylinderGeometry(0.004, 0.004, 0.75), new MeshStandardMaterial({ color: 0xe53e3e }));
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.03, 0.05 - 0.75 / 2 + 0.05);
  bow.add(arrow);

  // Front stabilizer
  const stab = new Mesh(new CylinderGeometry(0.008, 0.008, 0.7), limbMat);
  stab.rotation.x = Math.PI / 2;
  stab.position.set(0, -0.12, -0.35);
  bow.add(stab);

  const axes = new AxesHelper(0.15);
  bow.add(axes);
  return bow;
}

/** Simple head with a nose pointing along -Z (looking towards target). */
export function createHead(): Group {
  const head = new Group();
  const skin = new MeshStandardMaterial({ color: 0xf6c9a0, roughness: 0.8 });
  head.add(new Mesh(new SphereGeometry(0.1, 24, 16), skin));
  const nose = new Mesh(new ConeGeometry(0.02, 0.05, 12), skin);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -0.11);
  head.add(nose);
  head.add(new AxesHelper(0.15));
  return head;
}

/** Generic body segment marker for sensors without a dedicated model. */
export function createMarker(color = 0x38a169): Group {
  const g = new Group();
  g.add(new Mesh(new BoxGeometry(0.12, 0.04, 0.08), new MeshStandardMaterial({ color })));
  g.add(new AxesHelper(0.12));
  return g;
}
