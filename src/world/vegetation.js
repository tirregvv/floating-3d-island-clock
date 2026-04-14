import * as THREE from "three";
import * as config from "../config.js";

export function buildVegetation(islandGroup, materials, tilePositions, rng, treeSnowMaterials) {
	const {
		trunkMat,
		leavesMat,
		leavesMat2,
		rockMat,
		rockMat2,
		flowerStemMat,
		flowerPetalMats,
		snowMat,
	} = materials;
	const n = config.counts;

	function createTree(x, y, z, scale) {
		const tree = new THREE.Group();
		const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 5), trunkMat);
		trunk.position.y = 0.4;
		trunk.castShadow = true;
		tree.add(trunk);
		const mat = rng() > 0.5 ? leavesMat : leavesMat2;
		[
			[0.55, 0.7, 1.1],
			[0.42, 0.6, 1.55],
			[0.28, 0.45, 1.9],
		].forEach(([r, h, py]) => {
			const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
			f.position.y = py;
			f.castShadow = true;
			tree.add(f);
			const snowCapMaterial = snowMat.clone();
			snowCapMaterial.opacity = 0;
			const snowCap = new THREE.Mesh(
				new THREE.ConeGeometry(r * 0.78, Math.max(0.12, h * 0.18), 6),
				snowCapMaterial,
			);
			snowCap.position.y = py + 0.12;
			snowCap.rotation.y = Math.random() * Math.PI * 2;
			snowCap.castShadow = false;
			tree.add(snowCap);
			treeSnowMaterials.push(snowCapMaterial);
		});
		tree.position.set(x, y + 0.1, z);
		tree.scale.setScalar(scale);
		tree.rotation.y = rng() * Math.PI * 2;
		return tree;
	}

	const treeMeshes = [];
	for (let i = 0; i < n.trees; i++) {
		const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
		if (tile.dist < n.treeDistMin) continue;
		const t = createTree(
			tile.x + (rng() - 0.5) * 0.3,
			tile.y,
			tile.z + (rng() - 0.5) * 0.3,
			0.6 + rng() * 0.7,
		);
		islandGroup.add(t);
		treeMeshes.push(t);
	}

	for (let i = 0; i < n.rocks; i++) {
		const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
		if (tile.dist < n.rockDistMin) continue;
		const geo = new THREE.DodecahedronGeometry(0.12 + rng() * 0.15, 0);
		const mat = rng() > 0.5 ? rockMat : rockMat2;
		const rock = new THREE.Mesh(geo, mat);
		rock.position.set(tile.x + (rng() - 0.5) * 0.4, tile.y + 0.12, tile.z + (rng() - 0.5) * 0.4);
		rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
		rock.scale.set(1 + rng() * 0.5, 0.6 + rng() * 0.4, 1 + rng() * 0.5);
		rock.castShadow = true;
		rock.receiveShadow = true;
		islandGroup.add(rock);
	}

	for (let i = 0; i < n.flowers; i++) {
		const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
		if (tile.dist < n.flowerDistMin) continue;
		const flower = new THREE.Group();
		const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 3), flowerStemMat);
		stem.position.y = 0.1;
		flower.add(stem);
		const petal = new THREE.Mesh(
			new THREE.SphereGeometry(0.06, 5, 4),
			flowerPetalMats[Math.floor(rng() * flowerPetalMats.length)],
		);
		petal.position.y = 0.22;
		petal.scale.y = 0.5;
		flower.add(petal);
		flower.position.set(tile.x + (rng() - 0.5) * 0.5, tile.y + 0.08, tile.z + (rng() - 0.5) * 0.5);
		flower.scale.setScalar(0.7 + rng() * 0.6);
		flower.rotation.y = rng() * Math.PI * 2;
		islandGroup.add(flower);
	}

	return { treeMeshes };
}
