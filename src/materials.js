import * as THREE from "three";
import * as config from "./config.js";

export function createMaterials() {
	const c = config.colors;
	const m = config.materials;
	const flowerPetalMats = c.flowerPetals.map((col) => new THREE.MeshLambertMaterial({ color: col }));

	return {
		grassMat: new THREE.MeshLambertMaterial({ color: c.grass }),
		dirt1Mat: new THREE.MeshLambertMaterial({ color: c.dirt1 }),
		dirt2Mat: new THREE.MeshLambertMaterial({ color: c.dirt2 }),
		dirt3Mat: new THREE.MeshLambertMaterial({ color: c.dirt3 }),
		stoneMat: new THREE.MeshLambertMaterial({ color: c.stone }),
		stoneMat2: new THREE.MeshLambertMaterial({ color: c.stone2 }),
		woodMat: new THREE.MeshLambertMaterial({ color: c.wood }),
		roofMat: new THREE.MeshLambertMaterial({ color: c.roof }),
		doorMat: new THREE.MeshLambertMaterial({ color: c.door }),
		trunkMat: new THREE.MeshLambertMaterial({ color: c.trunk }),
		leavesMat: new THREE.MeshLambertMaterial({ color: c.leaves }),
		leavesMat2: new THREE.MeshLambertMaterial({ color: c.leaves2 }),
		deciduousMat: new THREE.MeshLambertMaterial({ color: c.deciduousLeaves }),
		deciduousMat2: new THREE.MeshLambertMaterial({ color: c.deciduousLeaves2 }),
		rockMat: new THREE.MeshLambertMaterial({ color: c.rock }),
		rockMat2: new THREE.MeshLambertMaterial({ color: c.rock2 }),
		flowerStemMat: new THREE.MeshLambertMaterial({ color: c.flowerStem }),
		flowerPetalMats,
		cloudMat: new THREE.MeshLambertMaterial({
			color: c.cloud,
			transparent: true,
			opacity: m.cloudOpacity,
		}),
		windowMat: new THREE.MeshLambertMaterial({
			color: c.window,
			emissive: c.windowEmissive,
			emissiveIntensity: m.windowEmissiveIntensity,
		}),
		lanternGlowMat: new THREE.MeshLambertMaterial({
			color: c.lantern,
			emissive: c.lanternEmissive,
			emissiveIntensity: m.lanternEmissiveIntensity,
		}),
		snowMat: new THREE.MeshLambertMaterial({
			color: c.snow,
			emissive: c.snowEmissive,
			emissiveIntensity: 0.2,
			transparent: true,
			opacity: m.snowOpacity,
		}),
	};
}
