import * as THREE from "three";
import * as config from "../config.js";
import { createRoundedBox } from "../utils/geometry.js";

export function buildTerrain(islandGroup, materials, rng) {
	const t = config.terrain;
	const TILE_ACTUAL = t.tileSize - t.gap;
	const CENTER = (t.gridSize - 1) / 2;
	const tilePositions = [];

	const grassGeo = createRoundedBox(TILE_ACTUAL, TILE_ACTUAL, 0.22, 0.12, 3);
	const dirt1Geo = createRoundedBox(TILE_ACTUAL * 0.95, TILE_ACTUAL * 0.95, 0.38, 0.09, 2);
	const dirt2Geo = createRoundedBox(TILE_ACTUAL * 0.88, TILE_ACTUAL * 0.88, 0.45, 0.07, 2);
	const dirt3Geo = createRoundedBox(TILE_ACTUAL * 0.8, TILE_ACTUAL * 0.8, 0.55, 0.07, 2);
	const stone1Geo = createRoundedBox(TILE_ACTUAL * 0.72, TILE_ACTUAL * 0.72, 0.6, 0.06, 1);
	const stone2Geo = createRoundedBox(TILE_ACTUAL * 0.62, TILE_ACTUAL * 0.62, 0.7, 0.05, 1);

	const {
		grassMat,
		dirt1Mat,
		dirt2Mat,
		dirt3Mat,
		stoneMat,
		stoneMat2,
	} = materials;

	for (let row = 0; row < t.gridSize; row++) {
		for (let col = 0; col < t.gridSize; col++) {
			const dx = col - CENTER;
			const dz = row - CENTER;
			const dist = Math.sqrt(dx * dx + dz * dz);
			const normDist = dist / (t.islandRadius / t.tileSize);
			if (normDist > 1.0) continue;
			const heightOffset = Math.cos(normDist * Math.PI * 0.5) * t.heightCosScale + rng() * t.heightNoise;
			const px = dx * t.tileSize;
			const pz = dz * t.tileSize;
			const py = heightOffset;
			const depthFactor = 1 - normDist;
			const tileGroup = new THREE.Group();
			tileGroup.position.set(px, py, pz);
			const grassMesh = new THREE.Mesh(grassGeo, grassMat);
			grassMesh.castShadow = true;
			grassMesh.receiveShadow = true;
			tileGroup.add(grassMesh);
			const d1 = new THREE.Mesh(dirt1Geo, dirt1Mat);
			d1.position.y = -0.33;
			tileGroup.add(d1);
			const d2 = new THREE.Mesh(dirt2Geo, dirt2Mat);
			d2.position.y = -0.75;
			tileGroup.add(d2);
			const d3 = new THREE.Mesh(dirt3Geo, dirt3Mat);
			d3.position.y = -1.25;
			tileGroup.add(d3);
			if (depthFactor > t.depthStone1) {
				const s1 = new THREE.Mesh(stone1Geo, stoneMat);
				s1.position.y = -1.82;
				tileGroup.add(s1);
			}
			if (depthFactor > t.depthStone2) {
				const s2 = new THREE.Mesh(stone2Geo, stoneMat2);
				s2.position.y = -2.48;
				tileGroup.add(s2);
			}
			islandGroup.add(tileGroup);
			tilePositions.push({ x: px, y: py, z: pz, dist: normDist });
		}
	}

	return { tilePositions, grassGeo };
}
