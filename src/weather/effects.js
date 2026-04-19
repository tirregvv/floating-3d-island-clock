import * as THREE from "three";
import * as config from "../config.js";

export function buildWeatherEffects(scene, islandGroup, tilePositions, grassGeo, counts) {
	const n = counts ?? config.counts;
	const col = config.colors;
	const stormCloudMats = [];
	const stormClouds = [];
	for (let i = 0; i < n.stormClouds; i++) {
		const cloud = new THREE.Group();
		const count = 5 + Math.floor(Math.random() * 5);
		for (let j = 0; j < count; j++) {
			const mat = new THREE.MeshLambertMaterial({ color: col.stormCloudBase, transparent: true, opacity: 0 });
			stormCloudMats.push(mat);
			const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.6, 7, 6), mat);
			puff.position.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.2);
			puff.scale.y = 0.45 + Math.random() * 0.3;
			cloud.add(puff);
		}
		cloud.position.set((Math.random() - 0.5) * 32, 4 + Math.random() * 3.5, (Math.random() - 0.5) * 32);
		cloud.userData.speed = 0.18 + Math.random() * 0.28;
		cloud.userData.baseX = cloud.position.x;
		cloud.userData.baseZ = cloud.position.z;
		scene.add(cloud);
		stormClouds.push(cloud);
	}

	const rainMat = new THREE.LineBasicMaterial({ color: col.rain, transparent: true, opacity: 0.5 });
	const rainDrops = [];
	for (let i = 0; i < n.rainDrops; i++) {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, -0.38, 0]), 3));
		const line = new THREE.Line(geo, rainMat.clone());
		line.userData.vy = -20 - Math.random() * 8;
		line.userData.vx = (Math.random() - 0.5) * 1.5;
		line.userData.vz = (Math.random() - 0.5) * 1.5;
		line.position.set((Math.random() - 0.5) * 30, 14 + Math.random() * 8, (Math.random() - 0.5) * 30);
		line.visible = false;
		scene.add(line);
		rainDrops.push(line);
	}

	const puddleMeshes = [];
	for (let i = 0; i < n.puddles; i++) {
		const tile = tilePositions[Math.floor(Math.random() * tilePositions.length)];
		const mat = new THREE.MeshBasicMaterial({ color: col.puddle, transparent: true, opacity: 0, side: THREE.DoubleSide });
		const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.1 + Math.random() * 0.2, 8), mat);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(tile.x + (Math.random() - 0.5) * 0.3, tile.y + 0.125, tile.z + (Math.random() - 0.5) * 0.3);
		mesh.visible = false;
		islandGroup.add(mesh);
		puddleMeshes.push({ mesh, mat, phase: Math.random() * Math.PI * 2 });
	}

	const m = config.materials;
	const leafMats = [
		new THREE.MeshBasicMaterial({ color: col.leaf1, side: THREE.DoubleSide, transparent: true, opacity: m.leafOpacity }),
		new THREE.MeshBasicMaterial({ color: col.leaf2, side: THREE.DoubleSide, transparent: true, opacity: m.leafOpacity }),
		new THREE.MeshBasicMaterial({ color: col.leaf3, side: THREE.DoubleSide, transparent: true, opacity: m.leafOpacity }),
	];
	const leafParticles = [];
	for (let i = 0; i < n.leafParticles; i++) {
		const mat = leafMats[i % leafMats.length];
		const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), mat);
		leaf.userData.vx = (Math.random() - 0.5) * 5 + 3;
		leaf.userData.vy = -1.2 - Math.random() * 1.8;
		leaf.userData.vz = (Math.random() - 0.5) * 4;
		leaf.userData.spin = (Math.random() - 0.5) * 7;
		leaf.userData.wobble = Math.random() * Math.PI * 2;
		leaf.position.set((Math.random() - 0.5) * 26, 9 + Math.random() * 5, (Math.random() - 0.5) * 26);
		leaf.visible = false;
		scene.add(leaf);
		leafParticles.push(leaf);
	}

	const snowMat2 = new THREE.MeshBasicMaterial({ color: col.snowFlake, transparent: true, opacity: m.snowFlakeOpacity });
	const snowFlakes = [];
	for (let i = 0; i < n.snowFlakes; i++) {
		const flake = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4), snowMat2.clone());
		flake.userData.vx = (Math.random() - 0.5) * 2;
		flake.userData.vy = -2.5 - Math.random() * 2;
		flake.userData.vz = (Math.random() - 0.5) * 2;
		flake.userData.wobble = Math.random() * Math.PI * 2;
		flake.position.set((Math.random() - 0.5) * 28, 14 + Math.random() * 8, (Math.random() - 0.5) * 28);
		flake.visible = false;
		scene.add(flake);
		snowFlakes.push(flake);
	}

	const snowCoverMat = new THREE.MeshLambertMaterial({ color: col.snowCover, transparent: true, opacity: 0 });
	const snowCovers = [];
	for (const tp of tilePositions) {
		const mat = snowCoverMat.clone();
		const mesh = new THREE.Mesh(grassGeo, mat);
		mesh.position.set(tp.x, tp.y + 0.135, tp.z);
		mesh.scale.setScalar(1.05);
		mesh.visible = false;
		islandGroup.add(mesh);
		snowCovers.push({ mesh, mat });
	}

	const thunderLight = new THREE.PointLight(col.thunderPoint, 0, 120, 2);
	thunderLight.position.set(0, 32, 0);
	thunderLight.decay = 2;
	scene.add(thunderLight);

	const thunderFill = new THREE.DirectionalLight(col.thunderFill, 0);
	thunderFill.position.set(0, 24, 8);
	thunderFill.target.position.set(0, 0, 0);
	scene.add(thunderFill);

	return {
		stormClouds,
		rainDrops,
		puddleMeshes,
		leafParticles,
		snowFlakes,
		snowCovers,
		thunderLight,
		thunderFill,
	};
}
