import * as THREE from "three";
import * as config from "../config.js";

function appendSwayUserData(tree, foliage, rng, wcfg) {
	tree.userData.foliage = foliage;
	tree.userData.swayP1 = rng() * Math.PI * 2;
	tree.userData.swayP2 = rng() * Math.PI * 2;
	tree.userData.swayF1 = wcfg.treeSwayF1Min + rng() * wcfg.treeSwayF1Spread;
	tree.userData.swayF2 = wcfg.treeSwayF2Min + rng() * wcfg.treeSwayF2Spread;
}

function finalizeTreePlacement(tree, x, y, z, scale, rng) {
	tree.position.set(x, y + 0.1, z);
	tree.scale.setScalar(scale);
	tree.rotation.y = rng() * Math.PI * 2;
}

/** Weighted pine vs round deciduous, then shuffled. */
function buildTreeTypeList(rng, total) {
	const types = [];
	const wPine = 0.55;
	for (let i = 0; i < total; i++) {
		types.push(rng() < wPine ? "pine" : "round");
	}
	for (let i = types.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[types[i], types[j]] = [types[j], types[i]];
	}
	return types;
}

export function buildVegetation(islandGroup, materials, tilePositions, rng, treeSnowMaterials, counts) {
	const {
		trunkMat,
		leavesMat,
		leavesMat2,
		deciduousMat,
		deciduousMat2,
		rockMat,
		rockMat2,
		flowerStemMat,
		flowerPetalMats,
		snowMat,
	} = materials;
	const n = counts ?? config.counts;
	const wcfg = config.weather;

	function addConeSnowCap(foliage, yLocal, coneR, coneH, treeSnowMaterials) {
		const snowCapMaterial = snowMat.clone();
		snowCapMaterial.opacity = 0;
		const snowCap = new THREE.Mesh(
			new THREE.ConeGeometry(coneR * 0.78, Math.max(0.12, coneH * 0.18), 6),
			snowCapMaterial,
		);
		snowCap.position.y = yLocal + 0.12;
		snowCap.rotation.y = rng() * Math.PI * 2;
		snowCap.castShadow = false;
		foliage.add(snowCap);
		treeSnowMaterials.push(snowCapMaterial);
	}

	/** Classic stacked cone evergreen. */
	function createPineTree(x, y, z, scale) {
		const foliagePivotY = 0.8;
		const tree = new THREE.Group();
		const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 5), trunkMat);
		trunk.position.y = 0.4;
		trunk.castShadow = true;
		tree.add(trunk);
		const foliage = new THREE.Group();
		foliage.position.y = foliagePivotY;
		tree.add(foliage);
		const mat = rng() > 0.5 ? leavesMat : leavesMat2;
		[
			[0.55, 0.7, 1.1],
			[0.42, 0.6, 1.55],
			[0.28, 0.45, 1.9],
		].forEach(([r, h, py]) => {
			const yLocal = py - foliagePivotY;
			const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
			f.position.y = yLocal;
			f.castShadow = true;
			foliage.add(f);
			addConeSnowCap(foliage, yLocal, r, h, treeSnowMaterials);
		});
		appendSwayUserData(tree, foliage, rng, wcfg);
		finalizeTreePlacement(tree, x, y, z, scale, rng);
		return tree;
	}

	/** Rounded deciduous-style canopy (stacked spheres). */
	function createRoundTree(x, y, z, scale) {
		const foliagePivotY = 0.72;
		const tree = new THREE.Group();
		const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.72, 6), trunkMat);
		trunk.position.y = 0.36;
		trunk.castShadow = true;
		tree.add(trunk);
		const foliage = new THREE.Group();
		foliage.position.y = foliagePivotY;
		tree.add(foliage);
		const layers = [
			{ r: 0.38, y: 0.08, mat: rng() > 0.5 ? deciduousMat : deciduousMat2 },
			{ r: 0.32, y: 0.38, mat: rng() > 0.5 ? deciduousMat2 : deciduousMat },
			{ r: 0.22, y: 0.62, mat: deciduousMat },
		];
		for (const layer of layers) {
			const yLocal = layer.y - foliagePivotY;
			const s = new THREE.Mesh(new THREE.SphereGeometry(layer.r, 7, 6), layer.mat);
			s.position.y = yLocal;
			s.castShadow = true;
			foliage.add(s);
			addConeSnowCap(foliage, yLocal, layer.r * 0.55, layer.r * 1.1, treeSnowMaterials);
		}
		appendSwayUserData(tree, foliage, rng, wcfg);
		finalizeTreePlacement(tree, x, y, z, scale, rng);
		return tree;
	}

	const treeMeshes = [];
	const typeList = buildTreeTypeList(rng, n.trees);
	let placed = 0;
	let attempts = 0;
	const maxAttempts = n.trees * 4;
	while (placed < n.trees && attempts < maxAttempts) {
		attempts++;
		const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
		if (tile.dist < n.treeDistMin) continue;
		const px = tile.x + (rng() - 0.5) * 0.3;
		const pz = tile.z + (rng() - 0.5) * 0.3;
		const sc = 0.6 + rng() * 0.7;
		const kind = typeList[placed];
		const t = kind === "round" ? createRoundTree(px, tile.y, pz, sc) : createPineTree(px, tile.y, pz, sc);
		islandGroup.add(t);
		treeMeshes.push(t);
		placed++;
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
