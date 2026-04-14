import * as THREE from "three";

export function createRoundedBox(w, h, d, r, s) {
	const shape = new THREE.Shape();
	const x = -w / 2;
	const y = -h / 2;
	shape.moveTo(x + r, y);
	shape.lineTo(x + w - r, y);
	shape.quadraticCurveTo(x + w, y, x + w, y + r);
	shape.lineTo(x + w, y + h - r);
	shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	shape.lineTo(x + r, y + h);
	shape.quadraticCurveTo(x, y + h, x, y + h - r);
	shape.lineTo(x, y + r);
	shape.quadraticCurveTo(x, y, x + r, y);
	const geo = new THREE.ExtrudeGeometry(shape, {
		depth: d,
		bevelEnabled: true,
		bevelThickness: r * 0.35,
		bevelSize: r * 0.35,
		bevelSegments: s,
	});
	geo.translate(0, 0, -d / 2);
	geo.rotateX(-Math.PI / 2);
	return geo;
}
