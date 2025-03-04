"use strict";

const fs = require("fs");

const { assert } = require("chai");
const path = require("path");

const PizZip = require("../es6/index");

const PizZipTestUtils = {
	loadZipFile(name, callback) {
		fs.readFile(path.resolve("test", name), "binary", callback);
	},
};
describe("PizZip", function () {
	// var PizZip = require('../lib');
	function similar(actual, expected, mistakes) {
		// actual is the generated zip, expected is what we got from the xhr.
		// Be sure to have a well formatted string
		expected = PizZip.utils.string2binary(expected);

		if (actual.length !== expected.length) {
			mistakes -= Math.abs((actual.length || 0) - (expected.length || 0));
		}

		for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
			if (actual.charAt(i) !== expected.charAt(i)) {
				mistakes--;
			}
		}

		if (mistakes < 0) {
			return false;
		}
		return true;
	}

	/**
	 * bytes -> PizZip -> bytes
	 */
	function reload(bytesStream) {
		return new PizZip(bytesStream, { checkCRC32: true }).generate({
			type: "string",
		});
	}

	// cache for files
	const refZips = {};

	function testZipFile(testName, zipName, testFunction) {
		it(testName, function () {
			if (refZips[zipName]) {
				testFunction.call(this, refZips[zipName]);
			} else {
				// stop();
				PizZipTestUtils.loadZipFile(zipName, function (err, file) {
					// if (QUnit.config.semaphore) {
					// start();
					// }

					if (err) {
						assert(false, err.toString());
						return;
					}

					file = PizZip.utils.transformTo("string", file);
					refZips[zipName] = file;
					testFunction.call(this, file);
				});
			}
		});
	}

	it("PizZip", function () {
		assert(PizZip, "PizZip exists");

		const zip = new PizZip();
		assert(zip instanceof PizZip, "Constructor works");

		// eslint-disable-next-line
		const zipNoNew = PizZip();
		assert(
			zipNoNew instanceof PizZip,
			"Constructor adds `new` before itself where necessary"
		);
	});

	describe("Essential", function () {
		it("PizZip.utils.transformTo", function () {
			const supportedArgs = ["string", "array"];
			if (PizZip.support.arraybuffer) {
				supportedArgs.push("arraybuffer");
			}
			if (PizZip.support.uint8array) {
				supportedArgs.push("uint8array");
			}
			if (PizZip.support.nodebuffer) {
				supportedArgs.push("nodebuffer");
			}

			const txt = "test text !";

			for (let i = 0; i < supportedArgs.length; i++) {
				for (let j = 0; j < supportedArgs.length; j++) {
					const step1 = PizZip.utils.transformTo(supportedArgs[i], txt);
					const step2 = PizZip.utils.transformTo(supportedArgs[j], step1);
					const result = PizZip.utils.transformTo("string", step2);
					assert.equal(
						result,
						txt,
						"The transformation string -> " +
							supportedArgs[i] +
							" -> " +
							supportedArgs[j] +
							" -> string works"
					);
				}
			}
		});

		testZipFile("Zip text file !", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip.file("Hello.txt", "Hello World\n");
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			/*
			   Expected differing bytes:
			   2  version number
			   4  date/time
			   4  central dir version numbers
			   4  central dir date/time
			   4  external file attributes

			   18 Total
			   */
			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
			assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
		});

		testZipFile("Add a file to overwrite", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip.file("Hello.txt", "hello ?");
			zip.file("Hello.txt", "Hello World\n");
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			/*
			   Expected differing bytes:
			   2  version number
			   4  date/time
			   4  central dir version numbers
			   4  central dir date/time
			   4  external file attributes

			   18 Total
			   */
			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
			assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
		});

		// zip -X -0 utf8.zip amount.txt
		testZipFile(
			"Zip text file with UTF-8 characters",
			"ref/utf8.zip",
			function (expected) {
				const zip = new PizZip();
				zip.file("amount.txt", "€15\n");
				const actual = zip.generate({ type: "string" });

				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
				assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
			}
		);

		// zip -X -0 utf8_in_name.zip €15.txt
		testZipFile(
			"Zip text file with UTF-8 characters in filename",
			"ref/utf8_in_name.zip",
			function () {
				const zip = new PizZip();
				zip.file("€15.txt", "€15\n");
				const actual = zip.generate({ type: "string" });

				// zip doesn't generate a strange file like us (utf8 flag AND unicode path extra field)
				// if one of the files has more data than the other, the bytes are no more aligned and the
				// error count goes through the roof. The parsing is checked on a other test so I'll
				// comment this one for now.
				// assert(similar(actual, expected, 18) , "Generated ZIP matches reference ZIP");
				assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
			}
		);

		testZipFile(
			"Zip text file with non unicode characters in filename",
			"ref/local_encoding_in_name.zip",
			function (content) {
				const zipUnicode = new PizZip(content);
				assert(
					!zipUnicode.files["Новая папка/"],
					"default : the folder is not found"
				);
				assert(
					!zipUnicode.files["Новая папка/Новый текстовый документ.txt"],
					"default : the file is not found"
				);

				const conversions = {
					"": [],
					"Новая папка/": [
						0x8d, 0xae, 0xa2, 0xa0, 0xef, 0x20, 0xaf, 0xa0, 0xaf, 0xaa, 0xa0,
						0x2f,
					],
					"Новая папка/Новый текстовый документ.txt": [
						0x8d, 0xae, 0xa2, 0xa0, 0xef, 0x20, 0xaf, 0xa0, 0xaf, 0xaa, 0xa0,
						0x2f, 0x8d, 0xae, 0xa2, 0xeb, 0xa9, 0x20, 0xe2, 0xa5, 0xaa, 0xe1,
						0xe2, 0xae, 0xa2, 0xeb, 0xa9, 0x20, 0xa4, 0xae, 0xaa, 0xe3, 0xac,
						0xa5, 0xad, 0xe2, 0x2e, 0x74, 0x78, 0x74,
					],
				};
				function decodeCP866(bytes) {
					for (const text in conversions) {
						if (conversions[text].length === bytes.length) {
							return text;
						}
					}
				}
				function encodeCP866(string) {
					return conversions[string];
				}
				const zipCP866 = new PizZip(content, {
					decodeFileName: decodeCP866,
				});

				assert(
					zipCP866.files["Новая папка/"],
					"with decodeFileName : the folder has been correctly read"
				);
				assert(
					zipCP866.files["Новая папка/Новый текстовый документ.txt"],
					"with decodeFileName : the file has been correctly read"
				);

				const newZip = zipCP866.generate({
					type: "string",
					encodeFileName: encodeCP866,
				});
				// the example zip doesn't contain the unicode path extra field, we can't
				// compare them.

				const zipCP866Reloaded = new PizZip(newZip, {
					decodeFileName: decodeCP866,
				});

				assert(
					zipCP866Reloaded.files["Новая папка/"],
					"reloaded, with decodeFileName : the folder has been correctly read"
				);
				assert(
					zipCP866Reloaded.files["Новая папка/Новый текстовый документ.txt"],
					"reloaded, with decodeFileName : the file has been correctly read"
				);
			}
		);

		// zip -X -0 pile_of_poo.zip Iñtërnâtiônàlizætiøn☃💩.txt
		testZipFile(
			"Zip text file and UTF-8, Pile Of Poo test",
			"ref/pile_of_poo.zip",
			function (expected) {
				const zip = new PizZip();
				// this is the string "Iñtërnâtiônàlizætiøn☃💩",
				// see http://mathiasbynens.be/notes/javascript-unicode
				// but escaped, to avoid troubles
				// thanks http://mothereff.in/js-escapes#1I%C3%B1t%C3%ABrn%C3%A2ti%C3%B4n%C3%A0liz%C3%A6ti%C3%B8n%E2%98%83%F0%9F%92%A9
				const text =
					"I\xF1t\xEBrn\xE2ti\xF4n\xE0liz\xE6ti\xF8n\u2603\uD83D\uDCA9";
				zip.file(text + ".txt", text + "\n");
				const actual = zip.generate({ type: "string" });

				assert.equal(reload(actual), actual, "Generated ZIP can be parsed");

				assert(
					new PizZip(expected).file(text + ".txt"),
					"PizZip finds the unicode file name on the external file"
				);
				assert(
					new PizZip(actual).file(text + ".txt"),
					"PizZip finds the unicode file name on its own file"
				);
				const textFromExpected = new PizZip(expected)
					.file(text + ".txt")
					.asText();
				const textFromActual = new PizZip(actual).file(text + ".txt").asText();

				assert.equal(
					textFromExpected,
					text + "\n",
					"PizZip can decode the external file"
				);
				assert.equal(
					textFromActual,
					text + "\n",
					"PizZip can decode its own file"
				);
			}
		);

		testZipFile("Zip text file with date", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip.file("Hello.txt", "Hello World\n", {
				date: new Date("July 17, 2009 14:36:57"),
			});
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			/*
			   Expected differing bytes:
			   2  version number
			   4  central dir version numbers
			   4  external file attributes

			   10 Total
			   */
			assert(
				similar(actual, expected, 10),
				"Generated ZIP matches reference ZIP"
			);
			assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
		});

		testZipFile("Zip image file", "ref/image.zip", function (expected) {
			const zip = new PizZip();
			zip.file(
				"smile.gif",
				"R0lGODdhBQAFAIACAAAAAP/eACwAAAAABQAFAAACCIwPkWerClIBADs=",
				{ base64: true }
			);
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
			assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
		});

		it("Zip folder() shouldn't throw an exception", function () {
			const zip = new PizZip();
			try {
				zip.folder();
				assert(true, "no exception thrown");
			} catch (e) {
				assert(false, e.message || e);
			}
		});

		testZipFile("Zip empty folder", "ref/folder.zip", function (expected) {
			const zip = new PizZip();
			zip.folder("folder");
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
			assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
		});

		testZipFile(
			"Zip text, folder and image",
			"ref/all.zip",
			function (expected) {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				zip
					.folder("images")
					.file(
						"smile.gif",
						"R0lGODdhBQAFAIACAAAAAP/eACwAAAAABQAFAAACCIwPkWerClIBADs=",
						{ base64: true }
					);
				const content = zip.generate();

				const actual = PizZip.base64.decode(content);

				/*
			   Expected differing bytes:
			   2  version number
			   4  date/time
			   4  central dir version numbers
			   4  central dir date/time
			   4  external file attributes

			   18 * 3 files
			   54 Total
			   */

				assert(
					similar(actual, expected, 54),
					"Generated ZIP matches reference ZIP"
				);
				assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
			}
		);

		it("Finding a file", function () {
			const zip = new PizZip();
			zip.file("Readme", "Hello World!\n");
			zip.file("Readme.French", "Bonjour tout le monde!\n");
			zip.file("Readme.Pirate", "Ahoy m'hearty!\n");

			assert.equal(
				zip.file("Readme.French").asText(),
				"Bonjour tout le monde!\n",
				"Exact match found"
			);
			assert.equal(zip.file("Readme.Deutch"), null, "Match exactly nothing");
			assert.equal(zip.file(/Readme\../).length, 2, "Match regex free text");
			assert.equal(zip.file(/pirate/i).length, 1, "Match regex 1 result");
		});

		testZipFile(
			"Finding a file : modifying the result doesn't alter the zip",
			"ref/text.zip",
			function (expected) {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				zip.file("Hello.txt").name = "Hello2.txt";
				zip.file("Hello.txt").dir = true;
				// these changes won't be used
				const content = zip.generate();

				const actual = PizZip.base64.decode(content);

				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
			}
		);

		it("Finding a file (text search) with a relative folder", function () {
			const zip = new PizZip();
			zip.folder("files/default").file("Readme", "Hello World!\n");
			zip
				.folder("files/translation")
				.file("Readme.French", "Bonjour tout le monde!\n");
			zip
				.folder("files")
				.folder("translation")
				.file("Readme.Pirate", "Ahoy m'hearty!\n");

			assert.equal(
				zip.file("files/translation/Readme.French").asText(),
				"Bonjour tout le monde!\n",
				"finding file with the full path"
			);
			assert.equal(
				zip.folder("files").file("translation/Readme.French").asText(),
				"Bonjour tout le monde!\n",
				"finding file with a relative path"
			);
			assert.equal(
				zip.folder("files/translation").file("Readme.French").asText(),
				"Bonjour tout le monde!\n",
				"finding file with a relative path"
			);
		});

		it("Finding files (regex) with a relative folder", function () {
			const zip = new PizZip();
			zip.folder("files/default").file("Readme", "Hello World!\n");
			zip
				.folder("files/translation")
				.file("Readme.French", "Bonjour tout le monde!\n");
			zip
				.folder("files")
				.folder("translation")
				.file("Readme.Pirate", "Ahoy m'hearty!\n");

			assert.equal(zip.file(/Readme/).length, 3, "match files in subfolders");
			assert.equal(
				zip.folder("files/translation").file(/Readme/).length,
				2,
				"regex match only in subfolders"
			);
			assert.equal(
				zip
					.folder("files")
					.folder("translation")
					.file(/Readme/).length,
				2,
				"regex match only in subfolders"
			);
			assert.equal(
				zip.folder("files/translation").file(/pirate/i).length,
				1,
				"regex match only in subfolders"
			);
			assert.equal(
				zip.folder("files/translation").file(/^readme/i).length,
				2,
				"regex match only with the relative path"
			);
			assert.equal(
				zip.folder("files/default").file(/pirate/i).length,
				0,
				"regex match only in subfolders"
			);
		});

		it("Finding folders", function () {
			const zip = new PizZip();
			zip.folder("root/").folder("sub1/");
			zip.folder("root/sub2/subsub1");

			assert.equal(zip.folder(/sub2\/$/).length, 0, "unique result");
			assert.equal(zip.folder(/sub1/).length, 2, "multiple results");
			assert.equal(zip.folder(/root/).length, 3, "match on whole path");
		});

		it("Finding folders with relative path", function () {
			const zip = new PizZip();
			zip.folder("root/").folder("sub1/");
			zip.folder("root/sub2/subsub1");
			const root = zip.folder("root/sub2");

			assert.equal(
				root.folder(/sub2\/$/).length,
				0,
				"current folder is not matched"
			);
			assert.equal(root.folder(/sub1/).length, 1, "sub folder is matched");
			assert.equal(
				root.folder(/^subsub1/).length,
				1,
				"relative folder path is used"
			);
			assert.equal(
				root.folder(/root/).length,
				0,
				"parent folder is not matched"
			);
		});

		function zipObjectsAssertions(zipObject) {
			const date = new Date("July 17, 2009 14:36:57");

			assert.equal(zipObject.name, "Hello.txt", "ZipObject#name is here");

			assert.equal(
				zipObject.comment,
				"my comment",
				"ZipObject#comment is here"
			);

			// the zip date has a 2s resolution
			const delta = Math.abs(zipObject.date.getTime() - date.getTime());
			assert(delta < 2000 /* ms */, date, "ZipObject#date is here");
			const deltaOptions = Math.abs(
				zipObject.options.date.getTime() - date.getTime()
			);
			assert(
				deltaOptions < 2000 /* ms */,
				date,
				"ZipObject#options.date is here (deprecated API)"
			);
		}
		it("ZipObject attributes", function () {
			const date = new Date("July 17, 2009 14:36:57");
			const zip = new PizZip();
			zip.file("Hello.txt", "Hello World\n", { comment: "my comment", date });
			zipObjectsAssertions(zip.file("Hello.txt"));
			zipObjectsAssertions(zip.files["Hello.txt"]);
			const reloaded = new PizZip(zip.generate({ base64: false }));
			zipObjectsAssertions(reloaded.file("Hello.txt"));
			zipObjectsAssertions(reloaded.files["Hello.txt"]);
		});
		it("generate uses updated ZipObject date attribute", function () {
			const date = new Date("July 17, 2009 14:36:57");
			const zip = new PizZip();
			zip.file("Hello.txt", "Hello World\n", { comment: "my comment" }); // date = now
			zip.files["Hello.txt"].date = date;
			const reloaded = new PizZip(zip.generate({ type: "string" }));
			zipObjectsAssertions(reloaded.file("Hello.txt"));
			zipObjectsAssertions(reloaded.files["Hello.txt"]);
		});
		it("generate uses updated ZipObject options.date attribute (deprecated)", function () {
			const date = new Date("July 17, 2009 14:36:57");
			const zip = new PizZip();
			zip.file("Hello.txt", "Hello World\n", { comment: "my comment" }); // date = now
			zip.files["Hello.txt"].options.date = date;
			const reloaded = new PizZip(zip.generate({ type: "string" }));
			zipObjectsAssertions(reloaded.file("Hello.txt"));
			zipObjectsAssertions(reloaded.files["Hello.txt"]);
		});

		// }}} module Essential
	});

	describe("More advanced", function () {
		testZipFile("Delete file", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip.file("Remove.txt", "This file should be deleted\n");
			zip.file("Hello.txt", "Hello World\n");
			zip.remove("Remove.txt");
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		testZipFile("Delete file in folder", "ref/folder.zip", function (expected) {
			const zip = new PizZip();
			zip
				.folder("folder")
				.file("Remove.txt", "This folder and file should be deleted\n");
			zip.remove("folder/Remove.txt");
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		testZipFile(
			"Delete file in folder, with a relative path",
			"ref/folder.zip",
			function (expected) {
				const zip = new PizZip();
				const folder = zip.folder("folder");
				folder.file("Remove.txt", "This folder and file should be deleted\n");
				folder.remove("Remove.txt");
				const content = zip.generate();

				const actual = PizZip.base64.decode(content);

				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
			}
		);

		testZipFile("Delete folder", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip
				.folder("remove")
				.file("Remove.txt", "This folder and file should be deleted\n");
			zip.file("Hello.txt", "Hello World\n");
			zip.remove("remove");
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		testZipFile(
			"Delete folder with a final /",
			"ref/text.zip",
			function (expected) {
				const zip = new PizZip();
				zip
					.folder("remove")
					.file("Remove.txt", "This folder and file should be deleted\n");
				zip.file("Hello.txt", "Hello World\n");
				zip.remove("remove/");
				const content = zip.generate();

				const actual = PizZip.base64.decode(content);

				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
			}
		);

		testZipFile("Delete unknown path", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip.file("Hello.txt", "Hello World\n");
			zip.remove("unknown_file");
			zip.remove("unknown_folder/Hello.txt");
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		testZipFile("Delete nested folders", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip
				.folder("remove")
				.file("Remove.txt", "This folder and file should be deleted\n");
			zip.folder("remove/second").file("Sub.txt", "This should be removed");
			zip.file("remove/second/another.txt", "Another file");
			zip.file("Hello.txt", "Hello World\n");
			zip.remove("remove");
			const content = zip.generate();

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		testZipFile(
			"Delete nested folders from relative path",
			"ref/folder.zip",
			function (expected) {
				const zip = new PizZip();
				zip.folder("folder");
				zip.folder("folder/1/2/3");
				zip.folder("folder").remove("1");
				const content = zip.generate();

				const actual = PizZip.base64.decode(content);

				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
				assert.equal(reload(actual), actual, "Generated ZIP can be parsed");
			}
		);

		testZipFile(
			"add file: from XHR (with bytes > 255)",
			"ref/text.zip",
			function (textZip) {
				const zip = new PizZip();
				zip.file("text.zip", textZip, { binary: true });
				const actual = zip.generate({ base64: false });

				assert.equal(
					reload(actual),
					actual,
					"high-order byte is discarded and won't mess up the result"
				);
			}
		);

		const _actualTestFileDataGetters = {
			asText(opts) {
				assert.equal(
					opts.zip.file("file.txt").asText(),
					opts.textData,
					opts.name + " : asText()"
				);
			},
			asBinary(opts) {
				assert.equal(
					opts.zip.file("file.txt").asBinary(),
					opts.rawData,
					opts.name + " : asBinary()"
				);
			},
			asArrayBuffer(opts) {
				if (PizZip.support.arraybuffer) {
					const buffer = opts.zip.file("file.txt").asArrayBuffer();
					assert(
						buffer instanceof ArrayBuffer,
						opts.name + " : the result is a instance of ArrayBuffer"
					);
					const actual = PizZip.utils.transformTo("string", buffer);
					assert.equal(actual, opts.rawData, opts.name + " : asArrayBuffer()");
				} else {
					try {
						opts.zip.file("file.txt").asArrayBuffer();
						assert(false, "no exception thrown");
					} catch (e) {
						assert(
							e.message.match("not supported by this browser"),
							opts.name + " : the error message is useful"
						);
					}
				}
			},
			asUint8Array(opts) {
				if (PizZip.support.uint8array) {
					const bufferView = opts.zip.file("file.txt").asUint8Array();
					assert(
						bufferView instanceof Uint8Array,
						opts.name + " : the result is a instance of Uint8Array"
					);
					const actual = PizZip.utils.transformTo("string", bufferView);
					assert.equal(actual, opts.rawData, opts.name + " : asUint8Array()");
				} else {
					try {
						opts.zip.file("file.txt").asUint8Array();
						assert(false, "no exception thrown");
					} catch (e) {
						assert(
							e.message.match("not supported by this browser"),
							opts.name + " : the error message is useful"
						);
					}
				}
			},
			asNodeBuffer(opts) {
				if (PizZip.support.nodebuffer) {
					const buffer = opts.zip.file("file.txt").asNodeBuffer();
					assert(
						buffer instanceof Buffer,
						opts.name + " : the result is a instance of Buffer"
					);
					const actual = PizZip.utils.transformTo("string", buffer);
					assert.equal(actual, opts.rawData, opts.name + " : .asNodeBuffer()");
				} else {
					try {
						opts.zip.file("file.txt").asNodeBuffer();
						assert(false, "no exception thrown");
					} catch (e) {
						assert(
							e.message.match("not supported by this browser"),
							opts.name + " : the error message is useful"
						);
					}
				}
			},
		};

		function testFileDataGetters(opts) {
			if (typeof opts.rawData === "undefined") {
				opts.rawData = opts.textData;
			}
			_actualTestFileDataGetters.asText(opts);
			_actualTestFileDataGetters.asBinary(opts);
			_actualTestFileDataGetters.asArrayBuffer(opts);
			_actualTestFileDataGetters.asUint8Array(opts);
			_actualTestFileDataGetters.asNodeBuffer(opts);

			function reload() {
				return {
					name: "reloaded, " + opts.name,
					// no check of crc32, we want to test the CompressedObject code.
					zip: new PizZip(
						opts.zip.generate({ type: "string" }, { checkCRC32: false })
					),
					textData: opts.textData,
					rawData: opts.rawData,
				};
			}

			_actualTestFileDataGetters.asText(reload());
			_actualTestFileDataGetters.asBinary(reload());
			_actualTestFileDataGetters.asArrayBuffer(reload());
			_actualTestFileDataGetters.asUint8Array(reload());
			_actualTestFileDataGetters.asNodeBuffer(reload());
		}

		it("add file: file(name, undefined)", function () {
			let zip = new PizZip(),
				undef;
			zip.file("file.txt", undef);
			testFileDataGetters({ name: "undefined", zip, textData: "" });
			zip = new PizZip();
			zip.file("file.txt", undef, { binary: true });
			testFileDataGetters({ name: "undefined", zip, textData: "" });
			zip = new PizZip();
			zip.file("file.txt", undef, { base64: true });
			testFileDataGetters({ name: "undefined", zip, textData: "" });
		});

		it("add file: file(name, null)", function () {
			let zip = new PizZip();
			zip.file("file.txt", null);
			testFileDataGetters({ name: "null", zip, textData: "" });
			zip = new PizZip();
			zip.file("file.txt", null, { binary: true });
			testFileDataGetters({ name: "null", zip, textData: "" });
			zip = new PizZip();
			zip.file("file.txt", null, { base64: true });
			testFileDataGetters({ name: "null", zip, textData: "" });
		});

		it("add file: file(name, stringAsText)", function () {
			let zip = new PizZip();
			zip.file("file.txt", "€15\n", { binary: false });
			testFileDataGetters({
				name: "utf8",
				zip,
				textData: "€15\n",
				rawData: "\xE2\x82\xAC15\n",
			});
			zip = new PizZip();
			zip.file("file.txt", "test\r\ntest\r\n", { binary: false });
			testFileDataGetters({
				name: "\\r\\n",
				zip,
				textData: "test\r\ntest\r\n",
			});
		});

		it("add file: file(name, stringAsBinary)", function () {
			let zip = new PizZip();
			zip.file("file.txt", "\xE2\x82\xAC15\n", { binary: true });
			testFileDataGetters({
				name: "utf8",
				zip,
				textData: "€15\n",
				rawData: "\xE2\x82\xAC15\n",
			});
			zip = new PizZip();
			zip.file("file.txt", "test\r\ntest\r\n", { binary: true });
			testFileDataGetters({
				name: "\\r\\n",
				zip,
				textData: "test\r\ntest\r\n",
			});
		});

		it("add file: file(name, base64)", function () {
			let zip = new PizZip();
			zip.file("file.txt", "4oKsMTUK", { base64: true });
			testFileDataGetters({
				name: "utf8",
				zip,
				textData: "€15\n",
				rawData: "\xE2\x82\xAC15\n",
			});
			zip = new PizZip();
			zip.file("file.txt", "dGVzdA0KdGVzdA0K", { base64: true });
			testFileDataGetters({
				name: "\\r\\n",
				zip,
				textData: "test\r\ntest\r\n",
			});
		});

		it("add file: file(name, unsupported)", function () {
			const zip = new PizZip();
			try {
				zip.file("test.txt", new Date());
				assert(
					false,
					"An unsupported object was added, but no exception thrown"
				);
			} catch (e) {
				assert(
					e.message.match(
						"Cannot read data from a Date, you probably are running new PizZip\\(data\\) with a date"
					),
					"the error message is useful"
				);
			}
			if (PizZip.support.blob) {
				const blob = zip.generate({ type: "blob" });
				try {
					zip.file("test.txt", blob);
					assert(false, "An blob was added, but no exception thrown");
				} catch (e) {
					assert(
						e.message.match("unsupported format"),
						"the error message is useful"
					);
				}
			}
		});

		it("should error if using Promise as first argument", function () {
			const p = new Promise(function (resolve) {
				resolve("hello");
			});
			try {
				const zip = new PizZip(p);
			} catch (e) {
				assert(
					e.message.match(
						"Cannot read data from a promise, you probably are running new PizZip\\(data\\) with a promise"
					),
					"the error message should be useful"
				);
			}
		});

		it("should error if using Object as first argument", function () {
			try {
				const zip = new PizZip({});
			} catch (e) {
				assert(
					e.message.match(
						"Unsupported data given to new PizZip\\(data\\) \\(object given\\)"
					),
					"the error message should be useful"
				);
			}
		});

		if (PizZip.support.uint8array) {
			it("add file: file(name, Uint8Array)", function () {
				function str2array(str) {
					const array = new Uint8Array(str.length);
					for (let i = 0; i < str.length; i++) {
						array[i] = str.charCodeAt(i);
					}
					return array;
				}
				let zip = new PizZip();
				zip.file("file.txt", str2array("\xE2\x82\xAC15\n"));
				testFileDataGetters({
					name: "utf8",
					zip,
					textData: "€15\n",
					rawData: "\xE2\x82\xAC15\n",
				});
				zip = new PizZip();
				zip.file("file.txt", str2array("test\r\ntest\r\n"));
				testFileDataGetters({
					name: "\\r\\n",
					zip,
					textData: "test\r\ntest\r\n",
				});
				zip = new PizZip();
				zip.file("file.txt", str2array(""));
				testFileDataGetters({ name: "empty content", zip, textData: "" });
			});
		}

		if (PizZip.support.arraybuffer) {
			it("add file: file(name, ArrayBuffer)", function () {
				function str2buffer(str) {
					const array = new Uint8Array(str.length);
					for (let i = 0; i < str.length; i++) {
						array[i] = str.charCodeAt(i);
					}
					return array.buffer;
				}
				let zip = new PizZip();
				zip.file("file.txt", str2buffer("\xE2\x82\xAC15\n"));
				testFileDataGetters({
					name: "utf8",
					zip,
					textData: "€15\n",
					rawData: "\xE2\x82\xAC15\n",
				});
				zip = new PizZip();
				zip.file("file.txt", str2buffer("test\r\ntest\r\n"));
				testFileDataGetters({
					name: "\\r\\n",
					zip,
					textData: "test\r\ntest\r\n",
				});
				zip = new PizZip();
				zip.file("file.txt", str2buffer(""));
				testFileDataGetters({ name: "empty content", zip, textData: "" });
			});
		}

		if (PizZip.support.nodebuffer) {
			it("add file: file(name, Buffer)", function () {
				function str2buffer(str) {
					const array = Buffer.alloc(str.length);
					for (let i = 0; i < str.length; i++) {
						array[i] = str.charCodeAt(i);
					}
					return array;
				}
				let zip = new PizZip();
				zip.file("file.txt", str2buffer("\xE2\x82\xAC15\n"));
				testFileDataGetters({
					name: "utf8",
					zip,
					textData: "€15\n",
					rawData: "\xE2\x82\xAC15\n",
				});
				zip = new PizZip();
				zip.file("file.txt", str2buffer("test\r\ntest\r\n"));
				testFileDataGetters({
					name: "\\r\\n",
					zip,
					textData: "test\r\ntest\r\n",
				});
				zip = new PizZip();
				zip.file("file.txt", str2buffer(""));
				testFileDataGetters({ name: "empty content", zip, textData: "" });
			});
		}

		testZipFile(
			"generate : base64:false. Deprecated, but it still works",
			"ref/text.zip",
			function (expected) {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				const actual = zip.generate({ base64: false });

				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
			}
		);

		testZipFile(
			"generate : base64:true. Deprecated, but it still works",
			"ref/text.zip",
			function (expected) {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				const content = zip.generate({ base64: true });
				const actual = PizZip.base64.decode(content);

				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
			}
		);

		testZipFile("generate : type:string", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip.file("Hello.txt", "Hello World\n");
			const actual = zip.generate({ type: "string" });

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		testZipFile("generate : type:base64", "ref/text.zip", function (expected) {
			const zip = new PizZip();
			zip.file("Hello.txt", "Hello World\n");
			const content = zip.generate({ type: "base64" });

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		if (PizZip.support.uint8array) {
			testZipFile(
				"generate : type:uint8array",
				"ref/text.zip",
				function (expected) {
					const zip = new PizZip();
					zip.file("Hello.txt", "Hello World\n");
					const array = zip.generate({ type: "uint8array" });
					assert(
						array instanceof Uint8Array,
						"The result is a instance of Uint8Array"
					);
					assert.equal(array.length, expected.length);

					const actual = PizZip.utils.transformTo("string", array);

					assert(
						similar(actual, expected, 18),
						"Generated ZIP matches reference ZIP"
					);
				}
			);
		} else {
			testZipFile("generate : type:uint8array", "ref/text.zip", function () {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				try {
					zip.generate({ type: "uint8array" });
					assert(false, "Uint8Array is not supported, but no exception thrown");
				} catch (e) {
					assert(
						e.message.match("not supported by this browser"),
						"the error message is useful"
					);
				}
			});
		}

		if (PizZip.support.arraybuffer) {
			testZipFile(
				"generate : type:arraybuffer",
				"ref/text.zip",
				function (expected) {
					const zip = new PizZip();
					zip.file("Hello.txt", "Hello World\n");
					const buffer = zip.generate({ type: "arraybuffer" });
					assert(
						buffer instanceof ArrayBuffer,
						"The result is a instance of ArrayBuffer"
					);

					const actual = PizZip.utils.transformTo("string", buffer);

					assert(
						similar(actual, expected, 18),
						"Generated ZIP matches reference ZIP"
					);
				}
			);
		} else {
			testZipFile("generate : type:arraybuffer", "ref/text.zip", function () {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				try {
					zip.generate({ type: "arraybuffer" });
					assert(
						false,
						"ArrayBuffer is not supported, but no exception thrown"
					);
				} catch (e) {
					assert(
						e.message.match("not supported by this browser"),
						"the error message is useful"
					);
				}
			});
		}

		if (PizZip.support.nodebuffer) {
			testZipFile(
				"generate : type:nodebuffer",
				"ref/text.zip",
				function (expected) {
					const zip = new PizZip();
					zip.file("Hello.txt", "Hello World\n");
					const buffer = zip.generate({ type: "nodebuffer" });
					assert(
						buffer instanceof Buffer,
						"The result is a instance of ArrayBuffer"
					);

					let actual = "";
					for (let i = 0; i < buffer.length; i++) {
						actual += String.fromCharCode(buffer[i]);
					}

					assert(
						similar(actual, expected, 18),
						"Generated ZIP matches reference ZIP"
					);
				}
			);
		} else {
			testZipFile("generate : type:nodebuffer", "ref/text.zip", function () {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				try {
					zip.generate({ type: "nodebuffer" });
					assert(false, "Buffer is not supported, but no exception thrown");
				} catch (e) {
					assert(
						e.message.match("not supported by this browser"),
						"the error message is useful"
					);
				}
			});
		}

		if (PizZip.support.blob) {
			testZipFile("generate : type:blob", "ref/text.zip", function (expected) {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				const blob = zip.generate({ type: "blob" });
				assert(blob instanceof Blob, "The result is a instance of Blob");
				assert.equal(blob.type, "application/zip");
				assert.equal(blob.size, expected.length);
			});
		} else {
			testZipFile("generate : type:blob", "ref/text.zip", function () {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				try {
					zip.generate({ type: "blob" });
					assert(false, "Blob is not supported, but no exception thrown");
				} catch (e) {
					assert(
						e.message.match("not supported by this browser"),
						"the error message is useful"
					);
				}
			});
		}

		if (PizZip.support.blob) {
			it("generate : type:blob mimeType:application/ods", function () {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				const blob = zip.generate({
					type: "blob",
					mimeType: "application/ods",
				});
				assert(blob instanceof Blob, "The result is a instance of Blob");
				assert.equal(
					blob.type,
					"application/ods",
					"mime-type is application/ods"
				);
			});
		} else {
			it("generate : type:blob  mimeType:application/ods", function () {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				try {
					zip.generate({
						type: "blob",
						mimeType: "application/ods",
					});
					assert(false, "Blob is not supported, but no exception thrown");
				} catch (e) {
					assert(
						e.message.match("not supported by this browser"),
						"the error message is useful"
					);
				}
			});
		}

		it("Filtering a zip", function () {
			const zip = new PizZip();
			zip.file("1.txt", "1\n");
			zip.file("2.txt", "2\n");
			zip.file("3.log", "3\n");
			const result = zip.filter(function (relativeFilename) {
				return relativeFilename.indexOf(".txt") !== -1;
			});
			assert.equal(result.length, 2, "filter has filtered");
			assert(
				result[0].name.indexOf(".txt") !== -1,
				"filter has filtered the good file"
			);
			assert(
				result[1].name.indexOf(".txt") !== -1,
				"filter has filtered the good file"
			);
		});

		it("Filtering a zip from a relative path", function () {
			const zip = new PizZip();
			zip.file("foo/1.txt", "1\n");
			zip.file("foo/2.txt", "2\n");
			zip.file("foo/3.log", "3\n");
			zip.file("1.txt", "1\n");
			zip.file("2.txt", "2\n");
			zip.file("3.log", "3\n");

			const result = zip.folder("foo").filter(function (relativeFilename) {
				return relativeFilename.indexOf("3") !== -1;
			});
			assert.equal(result.length, 1, "filter has filtered");
			assert.equal(
				result[0].name,
				"foo/3.log",
				"filter has filtered the good file"
			);
		});

		it("Filtering a zip : the full path is still accessible", function () {
			const zip = new PizZip();
			zip.file("foo/1.txt", "1\n");
			zip.file("foo/2.txt", "2\n");
			zip.file("foo/3.log", "3\n");
			zip.file("1.txt", "1\n");
			zip.file("2.txt", "2\n");
			zip.file("3.log", "3\n");

			const result = zip
				.folder("foo")
				.filter(function (relativeFilename, file) {
					return file.name.indexOf("3") !== -1;
				});
			assert.equal(
				result.length,
				1,
				"the filter only match files/folders in the current folder"
			);
			assert.equal(
				result[0].name,
				"foo/3.log",
				"filter has filtered the good file"
			);
		});

		testZipFile(
			"Filtering a zip : the filter function can't alter the data",
			"ref/text.zip",
			function (expected) {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				zip.filter(function (relativeFilename, file) {
					file.name = "bye.txt";
					file.data = "good bye";
					file.dir = true;
				});
				const content = zip.generate();

				const actual = PizZip.base64.decode(content);

				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
			}
		);

		testZipFile(
			"STORE is the default method",
			"ref/text.zip",
			function (expected) {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n");
				const content = zip.generate({ compression: "STORE" });

				const actual = PizZip.base64.decode(content);

				// no difference with the "Zip text file" test.
				assert(
					similar(actual, expected, 18),
					"Generated ZIP matches reference ZIP"
				);
			}
		);

		// zip -0 -X store.zip Hello.txt
		testZipFile("STORE doesn't compress", "ref/store.zip", function (expected) {
			const zip = new PizZip();
			zip.file(
				"Hello.txt",
				"This a looong file : we need to see the difference between the different compression methods.\n"
			);
			const content = zip.generate({ compression: "STORE" });

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		// zip -6 -X deflate.zip Hello.txt
		testZipFile("DEFLATE compress", "ref/deflate.zip", function (expected) {
			const zip = new PizZip();
			zip.file(
				"Hello.txt",
				"This a looong file : we need to see the difference between the different compression methods.\n"
			);
			const content = zip.generate({ compression: "DEFLATE" });

			const actual = PizZip.base64.decode(content);

			assert(
				similar(actual, expected, 18),
				"Generated ZIP matches reference ZIP"
			);
		});

		it("Lazy decompression works", function () {
			let zip = new PizZip();
			zip.folder("test/").file("Hello.txt", "hello !");

			const expected = zip.generate({ type: "string", compression: "STORE" });

			zip = new PizZip(expected); // lazy
			assert.equal(
				zip.generate({ type: "string", compression: "STORE" }),
				expected,
				"Reloading file, same compression"
			);

			zip = new PizZip(
				zip.generate({ type: "string", compression: "DEFLATE" })
			);
			zip = new PizZip(zip.generate({ type: "string", compression: "STORE" }));

			const zipData = zip.generate({ type: "string", compression: "STORE" });
			assert.equal(zipData, expected, "Reloading file, different compression");

			// check CRC32
			new PizZip(zipData, { checkCRC32: true }).generate({ type: "string" });
		});

		it("Empty files / folders are not compressed", function () {
			const zip = new PizZip();
			zip.file(
				"Hello.txt",
				"This a looong file : we need to see the difference between the different compression methods.\n"
			);
			zip.folder("folder").file("empty", "");

			let deflateCount = 0,
				emptyDeflateCount = 0;
			const oldDeflateCompress = PizZip.compressions.DEFLATE.compress;
			PizZip.compressions.DEFLATE.compress = function (str) {
				deflateCount++;
				if (!str) {
					emptyDeflateCount++;
				}
				return str;
			};
			zip.generate({ compression: "DEFLATE" });

			assert.equal(deflateCount, 1, "The file has been compressed");
			assert.equal(
				emptyDeflateCount,
				0,
				"The file without content and the folder has not been compressed."
			);

			PizZip.compressions.DEFLATE.compress = oldDeflateCompress;
		});

		it("DEFLATE level on generate()", function () {
			const zip = new PizZip();
			zip.file("Hello.txt", "world");

			const oldDeflateCompress = PizZip.compressions.DEFLATE.compress;
			PizZip.compressions.DEFLATE.compress = function (str, options) {
				assert.equal(options.level, 5);
				return str;
			};
			zip.generate({
				compression: "DEFLATE",
				compressionOptions: { level: 5 },
			});

			PizZip.compressions.DEFLATE.compress = oldDeflateCompress;
		});

		it("DEFLATE level on file() takes precedence", function () {
			const zip = new PizZip();
			zip.file("Hello.txt", "world", { compressionOptions: { level: 9 } });

			const oldDeflateCompress = PizZip.compressions.DEFLATE.compress;
			PizZip.compressions.DEFLATE.compress = function (str, options) {
				assert.equal(options.level, 9);
				return str;
			};
			zip.generate({
				compression: "DEFLATE",
				compressionOptions: { level: 5 },
			});

			PizZip.compressions.DEFLATE.compress = oldDeflateCompress;
		});

		it("unknown compression throws an exception", function () {
			const zip = new PizZip().file("file.txt", "test");
			try {
				zip.generate({ compression: "MAYBE" });
				assert(false, "no exception");
			} catch (e) {
				assert(true, "an exception were thrown");
			}
		});
	});

	describe("Load file, not supported features", function () {
		testZipFile("basic encryption", "ref/encrypted.zip", function (file) {
			try {
				// eslint-disable-next-line
				new PizZip(file);
				assert(
					false,
					"Encryption is not supported, but no exception were thrown"
				);
			} catch (e) {
				assert.equal(
					e.message,
					"Encrypted zip are not supported",
					"the error message is useful"
				);
			}
		});
	});

	// zip -0 -X -e encrypted.zip Hello.txt
	describe("Load file, corrupted zip", function () {
		testZipFile(
			"bad compression method",
			"ref/invalid/compression.zip",
			function (file) {
				try {
					// eslint-disable-next-line
					new PizZip(file);
					assert(false, "no exception were thrown");
				} catch (e) {
					assert(
						e.message.match("Corrupted zip"),
						"the error message is useful"
					);
				}
			}
		);

		testZipFile(
			"invalid crc32 but no check",
			"ref/invalid/crc32.zip",
			function (file) {
				try {
					// eslint-disable-next-line
					new PizZip(file, { checkCRC32: false });
					assert(true, "no exception were thrown");
				} catch (e) {
					assert(
						false,
						"An exception were thrown but the check should have been disabled."
					);
				}
			}
		);

		testZipFile("invalid crc32", "ref/invalid/crc32.zip", function (file) {
			try {
				// eslint-disable-next-line
				new PizZip(file, { checkCRC32: true });
				assert(false, "no exception were thrown");
			} catch (e) {
				assert(e.message.match("Corrupted zip"), "the error message is useful");
			}
		});

		testZipFile("bad offset", "ref/invalid/bad_offset.zip", function (file) {
			try {
				// eslint-disable-next-line
				new PizZip(file);
				assert(false, "no exception were thrown");
			} catch (e) {
				assert(e.message.match("Corrupted zip"), "the error message is useful");
			}
		});

		it("truncated zip file", function () {
			try {
				// eslint-disable-next-line
				new PizZip("PK\x03\x04\x0A\x00\x00\x00<cut>");
				assert(false, "no exception were thrown");
			} catch (e) {
				assert(e.message.match("Corrupted zip"), "the error message is useful");
			}
		});

		// dd if=all.zip of=all_missing_bytes.zip bs=32 skip=1
		testZipFile(
			"zip file with missing bytes",
			"ref/all_missing_bytes.zip",
			function (file) {
				try {
					// eslint-disable-next-line
					new PizZip(file);
					assert(false, "no exception were thrown");
				} catch (e) {
					assert(
						e.message.match("Corrupted zip"),
						"the error message is useful"
					);
				}
			}
		);

		// dd if=zip64.zip of=zip64_missing_bytes.zip bs=32 skip=1
		testZipFile(
			"zip64 file with missing bytes",
			"ref/zip64_missing_bytes.zip",
			function (file) {
				try {
					// eslint-disable-next-line
					new PizZip(file);
					assert(false, "no exception were thrown");
				} catch (e) {
					assert(
						e.message.match("Corrupted zip"),
						"the error message is useful"
					);
				}
			}
		);
	});

	describe("Load file", function () {
		testZipFile("load(string) works", "ref/all.zip", function (file) {
			assert(typeof file === "string");
			const zip = new PizZip(file);
			assert.equal(
				zip.file("Hello.txt").asText(),
				"Hello World\n",
				"the zip was correctly read."
			);
		});

		testZipFile(
			"load(string) handles bytes > 255",
			"ref/all.zip",
			function (file) {
				// the method used to load zip with ajax will remove the extra bits.
				// adding extra bits :)
				let updatedFile = "";
				for (let i = 0; i < file.length; i++) {
					updatedFile += String.fromCharCode(
						(file.charCodeAt(i) & 0xff) + 0x4200
					);
				}
				const zip = new PizZip(updatedFile);

				assert.equal(
					zip.file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
			}
		);

		testZipFile("load(Array) works", "ref/deflate.zip", function (file) {
			const updatedFile = new Array(file.length);
			for (let i = 0; i < file.length; ++i) {
				updatedFile[i] = file.charCodeAt(i) + 0x4200;
			}
			const zip = new PizZip(updatedFile);

			assert.equal(
				zip.file("Hello.txt").asText(),
				"This a looong file : we need to see the difference between the different compression methods.\n",
				"the zip was correctly read."
			);
		});

		testZipFile(
			"load(array) handles bytes > 255",
			"ref/deflate.zip",
			function (file) {
				const updatedFile = new Array(file.length);
				for (let i = 0; i < file.length; ++i) {
					updatedFile[i] = file.charCodeAt(i) + 0x4200;
				}
				const zip = new PizZip(updatedFile);

				assert.equal(
					zip.file("Hello.txt").asText(),
					"This a looong file : we need to see the difference between the different compression methods.\n",
					"the zip was correctly read."
				);
			}
		);

		if (PizZip.support.arraybuffer) {
			testZipFile(
				"load(ArrayBuffer) works",
				"ref/all.zip",
				function (fileAsString) {
					const file = new ArrayBuffer(fileAsString.length);
					const bufferView = new Uint8Array(file);
					for (let i = 0; i < fileAsString.length; ++i) {
						bufferView[i] = fileAsString.charCodeAt(i);
					}

					assert(file instanceof ArrayBuffer);

					// when reading an arraybuffer, the CompressedObject mechanism will keep it and subarray() a Uint8Array.
					// if we request a file in the same format, we might get the same Uint8Array or its ArrayBuffer (the original zip file).
					assert.equal(
						new PizZip(file).file("Hello.txt").asArrayBuffer().byteLength,
						12,
						"don't get the original buffer"
					);
					assert.equal(
						new PizZip(file).file("Hello.txt").asUint8Array().buffer.byteLength,
						12,
						"don't get a view of the original buffer"
					);

					assert.equal(
						new PizZip(file).file("Hello.txt").asText(),
						"Hello World\n",
						"the zip was correctly read."
					);
				}
			);
		}

		if (PizZip.support.nodebuffer) {
			testZipFile("load(Buffer) works", "ref/all.zip", function (fileAsString) {
				const file = Buffer.alloc(fileAsString.length);
				for (let i = 0; i < fileAsString.length; ++i) {
					file[i] = fileAsString.charCodeAt(i);
				}

				assert.equal(
					new PizZip(file).file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
			});
		}

		if (PizZip.support.uint8array) {
			testZipFile(
				"load(Uint8Array) works",
				"ref/all.zip",
				function (fileAsString) {
					const file = new Uint8Array(fileAsString.length);
					for (let i = 0; i < fileAsString.length; ++i) {
						file[i] = fileAsString.charCodeAt(i);
					}

					assert(file instanceof Uint8Array);

					// when reading an arraybuffer, the CompressedObject mechanism will keep it and subarray() a Uint8Array.
					// if we request a file in the same format, we might get the same Uint8Array or its ArrayBuffer (the original zip file).
					assert.equal(
						new PizZip(file).file("Hello.txt").asArrayBuffer().byteLength,
						12,
						"don't get the original buffer"
					);
					assert.equal(
						new PizZip(file).file("Hello.txt").asUint8Array().buffer.byteLength,
						12,
						"don't get a view of the original buffer"
					);

					assert.equal(
						new PizZip(file).file("Hello.txt").asText(),
						"Hello World\n",
						"the zip was correctly read."
					);
				}
			);
		}

		// zip -6 -X deflate.zip Hello.txt
		testZipFile("zip with DEFLATE", "ref/deflate.zip", function (file) {
			const zip = new PizZip(file);
			assert.equal(
				zip.file("Hello.txt").asText(),
				"This a looong file : we need to see the difference between the different compression methods.\n",
				"the zip was correctly read."
			);
		});

		// zip -0 -X -z -c archive_comment.zip Hello.txt
		testZipFile(
			"read zip with comment",
			"ref/archive_comment.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.comment,
					"file comment",
					"the archive comment was correctly read."
				);
				assert.equal(
					zip.file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
				assert.equal(
					zip.file("Hello.txt").comment,
					"entry comment",
					"the entry comment was correctly read."
				);
			}
		);
		testZipFile(
			"generate zip with comment",
			"ref/archive_comment.zip",
			function (file) {
				const zip = new PizZip();
				zip.file("Hello.txt", "Hello World\n", { comment: "entry comment" });
				const generated = zip.generate({
					type: "string",
					comment: "file comment",
				});
				assert(
					similar(generated, file, 18),
					"Generated ZIP matches reference ZIP"
				);
				assert.equal(
					reload(generated),
					generated,
					"Generated ZIP can be parsed"
				);
			}
		);

		// zip -0 extra_attributes.zip Hello.txt
		testZipFile(
			"zip with extra attributes",
			"ref/extra_attributes.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
			}
		);

		// use -fz to force use of Zip64 format
		// zip -fz -0 zip64.zip Hello.txt
		testZipFile("zip 64", "ref/zip64.zip", function (file) {
			const zip = new PizZip(file);
			assert.equal(
				zip.file("Hello.txt").asText(),
				"Hello World\n",
				"the zip was correctly read."
			);
		});

		// use -fd to force data descriptors as if streaming
		// zip -fd -0 data_descriptor.zip Hello.txt
		testZipFile(
			"zip with data descriptor",
			"ref/data_descriptor.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
			}
		);

		// combo of zip64 and data descriptors :
		// zip -fz -fd -0 data_descriptor_zip64.zip Hello.txt
		// this generate a corrupted zip file :(

		// zip -0 -X zip_within_zip.zip Hello.txt && zip -0 -X nested.zip Hello.txt zip_within_zip.zip
		testZipFile("nested zip", "ref/nested.zip", function (file) {
			const zip = new PizZip(file);
			assert.equal(
				zip.file("Hello.txt").asText(),
				"Hello World\n",
				"the zip was correctly read."
			);
			const nested = new PizZip(zip.file("zip_within_zip.zip").asBinary());
			assert.equal(
				nested.file("Hello.txt").asText(),
				"Hello World\n",
				"the inner zip was correctly read."
			);
		});

		// zip -fd -0 nested_data_descriptor.zip data_descriptor.zip
		testZipFile(
			"nested zip with data descriptors",
			"ref/nested_data_descriptor.zip",
			function (file) {
				const zip = new PizZip(file);
				const nested = new PizZip(zip.file("data_descriptor.zip").asBinary());
				assert.equal(
					nested.file("Hello.txt").asText(),
					"Hello World\n",
					"the inner zip was correctly read."
				);
			}
		);

		// zip -fz -0 nested_zip64.zip zip64.zip
		testZipFile("nested zip 64", "ref/nested_zip64.zip", function (file) {
			const zip = new PizZip(file);
			const nested = new PizZip(zip.file("zip64.zip").asBinary());
			assert.equal(
				nested.file("Hello.txt").asText(),
				"Hello World\n",
				"the inner zip was correctly read."
			);
		});

		// nested zip 64 with data descriptors
		// zip -fz -fd -0 nested_data_descriptor_zip64.zip data_descriptor_zip64.zip
		// this generate a corrupted zip file :(

		// zip -X -0 utf8_in_name.zip €15.txt
		testZipFile(
			"Zip text file with UTF-8 characters in filename",
			"ref/utf8_in_name.zip",
			function (file) {
				const zip = new PizZip(file);
				assert(zip.file("€15.txt") !== null, "the utf8 file is here.");
				assert.equal(
					zip.file("€15.txt").asText(),
					"€15\n",
					"the utf8 content was correctly read (with file().asText)."
				);
				assert.equal(
					zip.files["€15.txt"].asText(),
					"€15\n",
					"the utf8 content was correctly read (with files[].astext)."
				);
			}
		);

		// Created with winrar
		// winrar will replace the euro symbol with a '_' but set the correct unicode path in an extra field.
		testZipFile(
			"Zip text file with UTF-8 characters in filename and windows compatibility",
			"ref/winrar_utf8_in_name.zip",
			function (file) {
				const zip = new PizZip(file);
				assert(zip.file("€15.txt") !== null, "the utf8 file is here.");
				assert.equal(
					zip.file("€15.txt").asText(),
					"€15\n",
					"the utf8 content was correctly read (with file().asText)."
				);
				assert.equal(
					zip.files["€15.txt"].asText(),
					"€15\n",
					"the utf8 content was correctly read (with files[].astext)."
				);
			}
		);

		// zip backslash.zip -0 -X Hel\\lo.txt
		testZipFile(
			"Zip text file with backslash in filename",
			"ref/backslash.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.file("Hel\\lo.txt").asText(),
					"Hello World\n",
					"the utf8 content was correctly read."
				);
			}
		);

		// use izarc to generate a zip file on windows
		testZipFile(
			"Zip text file from windows with \\ in central dir",
			"ref/slashes_and_izarc.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.folder("test").file("Hello.txt").asText(),
					"Hello world\r\n",
					"the content was correctly read."
				);
			}
		);

		it("A folder stays a folder", function () {
			const zip = new PizZip();
			zip.folder("folder/");
			assert(zip.files["folder/"].dir, "the folder is marked as a folder");
			assert(
				zip.files["folder/"].options.dir,
				"the folder is marked as a folder, deprecated API"
			);
			const reloaded = new PizZip(zip.generate({ base64: false }));
			assert(reloaded.files["folder/"].dir, "the folder is marked as a folder");
			assert(
				reloaded.files["folder/"].options.dir,
				"the folder is marked as a folder, deprecated API"
			);
		});

		it("file() creates a folder with dir:true", function () {
			const zip = new PizZip();
			zip.file("folder", null, {
				dir: true,
			});
			assert(
				zip.files["folder/"].dir,
				"the folder with options is marked as a folder"
			);
		});

		it("file() creates a folder with the right unix permissions", function () {
			const zip = new PizZip();
			zip.file("folder", null, {
				unixPermissions: parseInt("40500", 8),
			});
			assert(
				zip.files["folder/"].dir,
				"the folder with options is marked as a folder"
			);
		});

		it("file() creates a folder with the right dos permissions", function () {
			const zip = new PizZip();
			zip.file("folder", null, {
				dosPermissions: parseInt("010000", 2),
			});
			assert(
				zip.files["folder/"].dir,
				"the folder with options is marked as a folder"
			);
		});

		it("A folder stays a folder when created with file", function () {
			const referenceDate = new Date("July 17, 2009 14:36:56");
			const referenceComment = "my comment";
			const zip = new PizZip();
			zip.file("folder", null, {
				dir: true,
				date: referenceDate,
				comment: referenceComment,
				unixPermissions: parseInt("40500", 8),
			});

			assert(
				zip.files["folder/"].dir,
				"the folder with options is marked as a folder"
			);
			assert(
				zip.files["folder/"].options.dir,
				"the folder with options is marked as a folder, deprecated API"
			);
			assert.equal(
				zip.files["folder/"].date.getMilliseconds(),
				referenceDate.getMilliseconds(),
				"the folder with options has the correct date"
			);
			assert.equal(
				zip.files["folder/"].comment,
				referenceComment,
				"the folder with options has the correct comment"
			);
			assert.equal(
				zip.files["folder/"].unixPermissions.toString(8),
				"40500",
				"the folder with options has the correct UNIX permissions"
			);

			const reloaded = new PizZip(
				zip.generate({ type: "string", platform: "UNIX" })
			);

			assert(
				reloaded.files["folder/"].dir,
				"the folder with options is marked as a folder"
			);
			assert(
				reloaded.files["folder/"].options.dir,
				"the folder with options is marked as a folder, deprecated API"
			);

			assert(
				reloaded.files["folder/"].dir,
				"the folder with options is marked as a folder"
			);
			assert(
				reloaded.files["folder/"].options.dir,
				"the folder with options is marked as a folder, deprecated API"
			);
			assert.equal(
				reloaded.files["folder/"].date.getMilliseconds(),
				referenceDate.getMilliseconds(),
				"the folder with options has the correct date"
			);
			assert.equal(
				reloaded.files["folder/"].comment,
				referenceComment,
				"the folder with options has the correct comment"
			);
			assert.equal(
				reloaded.files["folder/"].unixPermissions.toString(8),
				"40500",
				"the folder with options has the correct UNIX permissions"
			);
		});

		it("file() adds a slash for directories", function () {
			const zip = new PizZip();
			zip.file("folder_without_slash", null, {
				dir: true,
			});
			zip.file("folder_with_slash/", null, {
				dir: true,
			});
			assert(
				zip.files["folder_without_slash/"],
				"added a slash if not provided"
			);
			assert(zip.files["folder_with_slash/"], "keep the existing slash");
		});

		it("folder() doesn't overwrite existing entries", function () {
			const referenceComment = "my comment";
			const zip = new PizZip();
			zip.file("folder", null, {
				dir: true,
				comment: referenceComment,
				unixPermissions: parseInt("40500", 8),
			});

			// calling folder() doesn't override it
			zip.folder("folder");

			assert.equal(
				zip.files["folder/"].comment,
				referenceComment,
				"the folder with options has the correct comment"
			);
			assert.equal(
				zip.files["folder/"].unixPermissions.toString(8),
				"40500",
				"the folder with options has the correct UNIX permissions"
			);
		});

		it("createFolders works on a file", function () {
			const zip = new PizZip();
			zip.file("false/0/1/2/file", "content", {
				createFolders: false,
				unixPermissions: "644",
			});
			zip.file("true/0/1/2/file", "content", {
				createFolders: true,
				unixPermissions: "644",
			});

			assert(!zip.files["false/"], "the false/ folder doesn't exist");
			assert(zip.files["true/"], "the true/ folder exists");
			assert.equal(
				zip.files["true/"].unixPermissions,
				null,
				"the options are not propagated"
			);
		});

		it("createFolders works on a folder", function () {
			const zip = new PizZip();
			zip.file("false/0/1/2/folder", null, {
				createFolders: false,
				unixPermissions: "777",
				dir: true,
			});
			zip.file("true/0/1/2/folder", null, {
				createFolders: true,
				unixPermissions: "777",
				dir: true,
			});

			assert(!zip.files["false/"], "the false/ folder doesn't exist");
			assert(zip.files["true/"], "the true/ folder exists");
			assert.equal(
				zip.files["true/"].unixPermissions,
				null,
				"the options are not propagated"
			);
		});

		// touch file_{666,640,400,755}
		// mkdir dir_{777,755,500}
		// for mode in 777 755 500 666 640 400; do
		//    chmod $mode *_$mode
		// done
		// then :
		// zip -r linux_zip.zip .
		// 7z a -r linux_7z.zip .
		// ...
		function assertUnixPermissions(file) {
			const zip = new PizZip(file);
			function doAsserts(fileName, dir, octal) {
				const mode = parseInt(octal, 8);
				assert.equal(
					zip.files[fileName].dosPermissions,
					null,
					fileName + ", no DOS permissions"
				);
				assert.equal(zip.files[fileName].dir, dir, fileName + " dir flag");
				assert.equal(
					zip.files[fileName].unixPermissions,
					mode,
					fileName + " mode " + octal
				);
			}

			doAsserts("dir_777/", true, "40777");
			doAsserts("dir_755/", true, "40755");
			doAsserts("dir_500/", true, "40500");
			doAsserts("file_666", false, "100666");
			doAsserts("file_640", false, "100640");
			doAsserts("file_400", false, "100400");
			doAsserts("file_755", false, "100755");
		}

		function assertDosPermissions(file) {
			const zip = new PizZip(file);
			function doAsserts(fileName, dir, binary) {
				const mode = parseInt(binary, 2);
				assert.equal(
					zip.files[fileName].unixPermissions,
					null,
					fileName + ", no UNIX permissions"
				);
				assert.equal(zip.files[fileName].dir, dir, fileName + " dir flag");
				assert.equal(
					zip.files[fileName].dosPermissions,
					mode,
					fileName + " mode " + mode
				);
			}

			if (zip.files["dir/"]) {
				doAsserts("dir/", true, "010000");
			}
			if (zip.files["dir_hidden/"]) {
				doAsserts("dir_hidden/", true, "010010");
			}
			doAsserts("file", false, "100000");
			doAsserts("file_ro", false, "100001");
			doAsserts("file_hidden", false, "100010");
			doAsserts("file_ro_hidden", false, "100011");
		}
		function reloadAndAssertUnixPermissions(file) {
			const zip = new PizZip(file);
			assertUnixPermissions(zip.generate({ type: "string", platform: "UNIX" }));
		}
		function reloadAndAssertDosPermissions(file) {
			const zip = new PizZip(file);
			assertDosPermissions(zip.generate({ type: "string", platform: "DOS" }));
		}
		testZipFile(
			"permissions on linux : file created by zip",
			"ref/permissions/linux_zip.zip",
			assertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by zip, reloaded",
			"ref/permissions/linux_zip.zip",
			reloadAndAssertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by 7z",
			"ref/permissions/linux_7z.zip",
			assertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by 7z, reloaded",
			"ref/permissions/linux_7z.zip",
			reloadAndAssertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by file-roller on ubuntu",
			"ref/permissions/linux_file_roller-ubuntu.zip",
			assertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by file-roller on ubuntu, reloaded",
			"ref/permissions/linux_file_roller-ubuntu.zip",
			reloadAndAssertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by file-roller on xubuntu",
			"ref/permissions/linux_file_roller-xubuntu.zip",
			assertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by file-roller on xubuntu, reloaded",
			"ref/permissions/linux_file_roller-xubuntu.zip",
			reloadAndAssertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by ark",
			"ref/permissions/linux_ark.zip",
			assertUnixPermissions
		);
		testZipFile(
			"permissions on linux : file created by ark, reloaded",
			"ref/permissions/linux_ark.zip",
			reloadAndAssertUnixPermissions
		);
		testZipFile(
			"permissions on mac : file created by finder",
			"ref/permissions/mac_finder.zip",
			assertUnixPermissions
		);
		testZipFile(
			"permissions on mac : file created by finder, reloaded",
			"ref/permissions/mac_finder.zip",
			reloadAndAssertUnixPermissions
		);

		testZipFile(
			"permissions on windows : file created by the compressed folders feature",
			"ref/permissions/windows_compressed_folders.zip",
			assertDosPermissions
		);
		testZipFile(
			"permissions on windows : file created by the compressed folders feature, reloaded",
			"ref/permissions/windows_compressed_folders.zip",
			reloadAndAssertDosPermissions
		);
		testZipFile(
			"permissions on windows : file created by 7z",
			"ref/permissions/windows_7z.zip",
			assertDosPermissions
		);
		testZipFile(
			"permissions on windows : file created by 7z, reloaded",
			"ref/permissions/windows_7z.zip",
			reloadAndAssertDosPermissions
		);
		testZipFile(
			"permissions on windows : file created by izarc",
			"ref/permissions/windows_izarc.zip",
			assertDosPermissions
		);
		testZipFile(
			"permissions on windows : file created by izarc, reloaded",
			"ref/permissions/windows_izarc.zip",
			reloadAndAssertDosPermissions
		);
		testZipFile(
			"permissions on windows : file created by winrar",
			"ref/permissions/windows_winrar.zip",
			assertDosPermissions
		);
		testZipFile(
			"permissions on windows : file created by winrar, reloaded",
			"ref/permissions/windows_winrar.zip",
			reloadAndAssertDosPermissions
		);

		// cat Hello.txt all.zip > all_prepended_bytes.zip
		testZipFile(
			"zip file with prepended bytes",
			"ref/all_prepended_bytes.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
			}
		);

		// cat all.zip Hello.txt > all_appended_bytes.zip
		testZipFile(
			"zip file with appended bytes",
			"ref/all_appended_bytes.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
			}
		);

		// cat Hello.txt zip64.zip > zip64_prepended_bytes.zip
		testZipFile(
			"zip64 file with extra bytes",
			"ref/zip64_prepended_bytes.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
			}
		);

		// cat zip64.zip Hello.txt > zip64_appended_bytes.zip
		testZipFile(
			"zip64 file with extra bytes",
			"ref/zip64_appended_bytes.zip",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.file("Hello.txt").asText(),
					"Hello World\n",
					"the zip was correctly read."
				);
			}
		);

		// }}} Load file
	});

	describe("Complex Files", function () {
		// http://www.feedbooks.com/book/8/the-metamorphosis
		testZipFile(
			"Franz Kafka - The Metamorphosis.epub",
			"ref/complex_files/Franz Kafka - The Metamorphosis.epub",
			function (file) {
				const zip = new PizZip(file);
				assert.equal(
					zip.filter(function () {
						return true;
					}).length,
					26,
					"the zip contains the good number of elements."
				);
				assert.equal(
					zip.file("mimetype").asText(),
					"application/epub+zip\r\n",
					"the zip was correctly read."
				);
				// the .ncx file tells us that the first chapter is in the main0.xml file.
				assert(
					zip
						.file("OPS/main0.xml")
						.asText()
						.indexOf(
							"One morning, as Gregor Samsa was waking up from anxious dreams"
						) !== -1,
					"the zip was correctly read."
				);
			}
		);

		// a showcase in http://msdn.microsoft.com/en-us/windows/hardware/gg463429
		testZipFile(
			"Outlook2007_Calendar.xps",
			"ref/complex_files/Outlook2007_Calendar.xps",
			function (file) {
				const zip = new PizZip(file);
				// the zip file contains 15 entries.
				assert.equal(
					zip.filter(function () {
						return true;
					}).length,
					15,
					"the zip contains the good number of elements."
				);
				assert(
					zip
						.file("[Content_Types].xml")
						.asText()
						.indexOf("application/vnd.ms-package.xps-fixeddocument+xml") !== -1,
					"the zip was correctly read."
				);
			}
		);

		// Same test as above, but with createFolders option set to true
		testZipFile(
			"Outlook2007_Calendar.xps",
			"ref/complex_files/Outlook2007_Calendar.xps",
			function (file) {
				const zip = new PizZip(file, { createFolders: true });
				// the zip file contains 15 entries, but we get 23 when creating all the sub-folders.
				assert.equal(
					zip.filter(function () {
						return true;
					}).length,
					23,
					"the zip contains the good number of elements."
				);
				assert(
					zip
						.file("[Content_Types].xml")
						.asText()
						.indexOf("application/vnd.ms-package.xps-fixeddocument+xml") !== -1,
					"the zip was correctly read."
				);
			}
		);

		// an example file in http://cheeso.members.winisp.net/srcview.aspx?dir=js-unzip
		// the data come from http://www.antarctica.ac.uk/met/READER/upper_air/
		testZipFile(
			"AntarcticaTemps.xlsx",
			"ref/complex_files/AntarcticaTemps.xlsx",
			function (file) {
				const zip = new PizZip(file);
				// the zip file contains 17 entries.
				assert.equal(
					zip.filter(function () {
						return true;
					}).length,
					17,
					"the zip contains the good number of elements."
				);
				assert(
					zip
						.file("[Content_Types].xml")
						.asText()
						.indexOf(
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
						) !== -1,
					"the zip was correctly read."
				);
			}
		);

		// Same test as above, but with createFolders option set to true
		testZipFile(
			"AntarcticaTemps.xlsx",
			"ref/complex_files/AntarcticaTemps.xlsx",
			function (file) {
				const zip = new PizZip(file, { createFolders: true });
				// the zip file contains 16 entries, but we get 27 when creating all the sub-folders.
				assert.equal(
					zip.filter(function () {
						return true;
					}).length,
					27,
					"the zip contains the good number of elements."
				);
				assert(
					zip
						.file("[Content_Types].xml")
						.asText()
						.indexOf(
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
						) !== -1,
					"the zip was correctly read."
				);
			}
		);

		// same as two up, but in the Open Document format
		testZipFile(
			"AntarcticaTemps.ods",
			"ref/complex_files/AntarcticaTemps.ods",
			function (file) {
				const zip = new PizZip(file);
				// the zip file contains 20 entries.
				assert.equal(
					zip.filter(function () {
						return true;
					}).length,
					20,
					"the zip contains the good number of elements."
				);
				assert(
					zip
						.file("META-INF/manifest.xml")
						.asText()
						.indexOf("application/vnd.oasis.opendocument.spreadsheet") !== -1,
					"the zip was correctly read."
				);
			}
		);

		// same as above, but in the Open Document format
		testZipFile(
			"AntarcticaTemps.ods",
			"ref/complex_files/AntarcticaTemps.ods",
			function (file) {
				const zip = new PizZip(file, { createFolders: true });
				// the zip file contains 19 entries, but we get 27 when creating all the sub-folders.
				assert.equal(
					zip.filter(function () {
						return true;
					}).length,
					27,
					"the zip contains the good number of elements."
				);
				assert(
					zip
						.file("META-INF/manifest.xml")
						.asText()
						.indexOf("application/vnd.oasis.opendocument.spreadsheet") !== -1,
					"the zip was correctly read."
				);
			}
		);
	});
});
