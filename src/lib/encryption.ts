import Cryptr from "cryptr";

let cryptr: Cryptr | undefined;

const getCryptr = () => {
	const encryptionKey = process.env.ENCRYPTION_KEY;

	if (!encryptionKey) {
		throw new Error("ENCRYPTION_KEY is required to encrypt or decrypt credentials");
	}

	if (!cryptr) {
		cryptr = new Cryptr(encryptionKey);
	}

	return cryptr;
};

export const encrypt = (text: string) => getCryptr().encrypt(text);
export const decrypt = (text: string) => getCryptr().decrypt(text);
