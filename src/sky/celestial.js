import * as THREE from "three";
import * as config from "../config.js";

export function buildCelestial(scene, celestialShell, materials, rng) {
	const c = config.celestial;
	const col = config.colors;
	const clouds = [];

	for (let i = 0; i < config.counts.baseClouds; i++) {
		const cloud = new THREE.Group();
		const count = 4 + Math.floor(rng() * 4);
		for (let j = 0; j < count; j++) {
			const puff = new THREE.Mesh(new THREE.SphereGeometry(0.4 + rng() * 0.5, 7, 6), materials.cloudMat);
			puff.position.set((rng() - 0.5) * 1.5, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.8);
			puff.scale.y = 0.5 + rng() * 0.3;
			cloud.add(puff);
		}
		cloud.position.set((rng() - 0.5) * c.cloudSpread, c.cloudBaseY + rng() * c.cloudYJitter, (rng() - 0.5) * c.cloudSpread);
		cloud.userData.speed = 0.15 + rng() * 0.25;
		cloud.userData.startX = cloud.position.x;
		cloud.userData.startZ = cloud.position.z;
		clouds.push(cloud);
		scene.add(cloud);
	}

	const moonShaderUniforms = {
		sunWorldPos: { value: new THREE.Vector3(1, 0, 0) },
		cameraWorldPos: { value: new THREE.Vector3() },
		uTime: { value: 0 },
		moonBrightness: { value: 1 },
	};
	const moonMat = new THREE.ShaderMaterial({
		uniforms: moonShaderUniforms,
		vertexShader: `
		varying vec3 vWorldNormal;
		varying vec3 vWorldPos;
		void main() {
			vWorldNormal = normalize(mat3(modelMatrix) * normal);
			vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
		fragmentShader: `
		uniform vec3 sunWorldPos;
		uniform vec3 cameraWorldPos;
		uniform float uTime;
		uniform float moonBrightness;
		varying vec3 vWorldNormal;
		varying vec3 vWorldPos;
		void main() {
			vec3 N = normalize(vWorldNormal);
			vec3 L = normalize(sunWorldPos - vWorldPos);
			vec3 V = normalize(cameraWorldPos - vWorldPos);
			float ndotl = dot(N, L);
			float lit = smoothstep(-0.06, 0.1, ndotl);
			float facing = max(0.0, dot(N, V));
			vec3 litCol = vec3(0.88, 0.92, 1.0) * (0.12 + 0.88 * lit) * moonBrightness;
			vec3 earth = vec3(0.12, 0.14, 0.2) * moonBrightness;
			vec3 col = mix(earth, litCol, lit);
			col = mix(vec3(0.02,0.03, 0.06), col, facing);
			float tw = 0.035 * sin(uTime * 1.2 + vWorldPos.x * 3.5 + vWorldPos.y * 2.1);
			col += tw * (1.0 - lit) * facing;
			gl_FragColor = vec4(col, 1.0);
		}
	`,
	});
	const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(c.moonRadius, c.moonSegments, c.moonSegments), moonMat);
	moonMesh.name = "moon";
	scene.add(moonMesh);

	const L = config.lights;
	const moonLight = new THREE.DirectionalLight(L.moonLightColor, 0.0);
	moonLight.castShadow = true;
	moonLight.shadow.mapSize.set(L.moonShadowMapSize, L.moonShadowMapSize);
	moonLight.shadow.camera.left = -16;
	moonLight.shadow.camera.right = 16;
	moonLight.shadow.camera.top = 16;
	moonLight.shadow.camera.bottom = -16;
	moonLight.shadow.camera.near = 1;
	moonLight.shadow.camera.far = 55;
	moonLight.shadow.bias = -0.001;
	scene.add(moonLight);

	const sunMat = new THREE.MeshBasicMaterial({
		color: col.sunMesh,
		opacity: config.materials.sunMeshOpacity,
		transparent: true,
	});
	const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(c.sunRadius, c.sunSegments, c.sunSegments), sunMat);
	sunMesh.name = "sun";
	scene.add(sunMesh);

	const starCount = config.counts.stars;
	const starGeo = new THREE.BufferGeometry();
	const starPos = new Float32Array(starCount * 3);
	for (let i = 0; i < starCount; i++) {
		const theta = rng() * Math.PI * 2;
		const phi = rng() * Math.PI;
		const r = c.starRadiusMin + rng() * c.starRadiusExtra;
		starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
		starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 20;
		starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
	}
	starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
	const starMat = new THREE.PointsMaterial({
		color: 0xffffff,
		size: c.starPointSize,
		sizeAttenuation: true,
		transparent: true,
		opacity: 0,
	});
	const starPoints = new THREE.Points(starGeo, starMat);
	celestialShell.add(starPoints);

	const fallingStars = [];
	const fs = c.fallingStar;
	let nextFallingStarTime = performance.now() + fs.nextDelayMinMs + Math.random() * fs.nextDelayExtraMs;
	const cometDir = new THREE.Vector3();
	const cometQuat = new THREE.Quaternion();

	function createFallingStar() {
		const comet = new THREE.Group();
		const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
		const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), headMat);
		comet.add(head);

		const tailGeo = new THREE.BufferGeometry().setAttribute(
			"position",
			new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1.1, -0.18, 0]), 3),
		);
		const tail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
		comet.add(tail);

		const startX = (Math.random() > 0.5 ? -1 : 1) * (24 + Math.random() * 14);
		const startY = 14 + Math.random() * 9;
		const startZ = (Math.random() - 0.5) * 22;
		const endX = -Math.sign(startX) * (20 + Math.random() * 8);
		const endY = 4 + Math.random() * 5;
		const endZ = startZ + (Math.random() - 0.5) * 12;
		const duration = 1.2 + Math.random() * 1.2;

		comet.position.set(startX, startY, startZ);
		comet.userData.velocity = new THREE.Vector3((endX - startX) / duration, (endY - startY) / duration, (endZ - startZ) / duration);
		comet.userData.life = duration;
		comet.userData.age = 0;

		cometDir.copy(comet.userData.velocity).normalize();
		cometQuat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), cometDir);
		comet.setRotationFromQuaternion(cometQuat);

		scene.add(comet);
		fallingStars.push(comet);
	}

	function updateFallingStars(dt) {
		const now = performance.now();
		if (now >= nextFallingStarTime) {
			createFallingStar();
			nextFallingStarTime = now + fs.nextDelayMinMs + Math.random() * fs.updateNextDelayExtraMs;
		}
		for (let i = fallingStars.length - 1; i >= 0; i--) {
			const comet = fallingStars[i];
			comet.userData.age += dt;
			comet.position.x += comet.userData.velocity.x * dt;
			comet.position.y += comet.userData.velocity.y * dt;
			comet.position.z += comet.userData.velocity.z * dt;
			const fade = Math.max(0, 1 - comet.userData.age / comet.userData.life);
			comet.children.forEach((child) => {
				if (child.material) child.material.opacity = fade * 0.9;
			});
			if (comet.userData.age >= comet.userData.life) {
				scene.remove(comet);
				fallingStars.splice(i, 1);
			}
		}
	}

	return {
		clouds,
		moonMesh,
		moonLight,
		moonShaderUniforms,
		sunMesh,
		sunMat,
		starMat,
		updateFallingStars,
	};
}
