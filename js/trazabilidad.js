/* ==========================================================
   Lógica del módulo: trazabilidad.html
   Extraída del HTML sin cambios: mismo código y mismo orden de ejecución.
   ========================================================== */
(function(){
var __defs={},__cache={};
function __req(n){n=n.replace(/^\.\//,"");if(__cache[n])return __cache[n].exports;var m={exports:{}};__cache[n]=m;__defs[n](m,m.exports,__req);return m.exports;}
__defs['QRMath']=function(module,exports,require){
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

module.exports = QRMath;

};
__defs['QRErrorCorrectLevel']=function(module,exports,require){
module.exports = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};


};
__defs['QRMaskPattern']=function(module,exports,require){
module.exports = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

};
__defs['QRMode']=function(module,exports,require){
module.exports = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

};
__defs['QRPolynomial']=function(module,exports,require){
var QRMath = require('./QRMath');

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};

module.exports = QRPolynomial;

};
__defs['QRRSBlock']=function(module,exports,require){
var QRErrorCorrectLevel = require('./QRErrorCorrectLevel');

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};

module.exports = QRRSBlock;

};
__defs['QRUtil']=function(module,exports,require){
var QRMode = require('./QRMode');
var QRPolynomial = require('./QRPolynomial');
var QRMath = require('./QRMath');
var QRMaskPattern = require('./QRMaskPattern');

var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};

module.exports = QRUtil;

};
__defs['QRBitBuffer']=function(module,exports,require){
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

module.exports = QRBitBuffer;

};
__defs['QR8bitByte']=function(module,exports,require){
var QRMode = require('./QRMode');

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

module.exports = QR8bitByte;

};
__defs['index']=function(module,exports,require){
//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------

var QR8bitByte = require('./QR8bitByte');
var QRUtil = require('./QRUtil');
var QRPolynomial = require('./QRPolynomial');
var QRRSBlock = require('./QRRSBlock');
var QRBitBuffer = require('./QRBitBuffer');

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};

module.exports = QRCode;

};
window.QRCodeLib=__req('index');window.QRCodeLib.EC=__req('QRErrorCorrectLevel');})();
(function(){
  'use strict';

  const $ = id => document.getElementById(id);

  if (typeof supabase === 'undefined') {
    $('avisoTexto').textContent = 'No se pudo cargar el sistema. Revisa tu conexión e intenta de nuevo.';
    $('aviso').classList.add('show');
    $('avisoBtn').addEventListener('click', () => window.location.reload());
    return;
  }

  const supabaseClient = DSI.cliente();

  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------
  // CONFIGURACIÓN
  // ---------------------------------------------------------------
  const LIMITE = 100;            // máximo de registros por etapa (mantiene las consultas livianas)
  const FRESCO_MS = 15000;       // un resultado en caché más nuevo que esto no se vuelve a pedir
  const MAX_SUGERENCIAS = 6;
  const MAX_RECIENTES = 5;
  const MAX_TRAZAS_GUARDADAS = 10;

  // ---------------------------------------------------------------
  // ESTADO
  // ---------------------------------------------------------------
  let usuarioActual = null;
  let productos = [];
  let indice = [];                // productos con el texto ya normalizado (búsqueda instantánea)
  let recepcionesNotif = [];      // solo para notificaciones
  let baseLista = false;
  let cargandoBase = false;
  let ultimaActualizacion = 0;
  let notifsActuales = [];

  let seleccionado = null;        // producto que se está mostrando
  let tokenSel = 0;               // descarta respuestas de selecciones anteriores
  let vistaActual = 'lotes';
  let datosTraza = null;
  let firmaTraza = '';
  let sugerenciasActuales = [];
  let sugActiva = -1;
  let urlAbierta = false;
  let proveedoresBusqueda = [];   // para el buscador de la barra superior
  const proveedorPorProducto = new Map(); // proveedor más reciente conocido por producto

  // Preferencias que se cambian en "Mi cuenta" (se guardan en este dispositivo)
  const PREF_NOTIF = 'deepsea_notificaciones';
  const PREF_AUTO  = 'deepsea_actualizacion';
  function leerPref(clave, porDefecto){
    try { const v = localStorage.getItem(clave); return v === null ? porDefecto : v; }
    catch (e) { return porDefecto; }
  }
  function aplicarPrefs(){
    $('notifWrap').hidden = leerPref(PREF_NOTIF, 'on') === 'off';
  }

  const memoria = new Map();      // id → { t, d }   (caché en memoria)
  const enVuelo = new Map();      // id → Promise    (evita pedir lo mismo dos veces)

  // ---------------------------------------------------------------
  // UTILIDADES
  // ---------------------------------------------------------------
  function escapeHTML(texto){
    return String(texto ?? '').replace(/[&<>"']/g, c => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
    ));
  }
  function normalizar(texto){
    return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  const fmtNumero = n => Math.round(n).toLocaleString('es-CO');
  const fmtPeso   = n => (Math.round(n * 100) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' kg';

  function parsearFecha(valor){
    if (!valor) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [a, m, d] = valor.split('-').map(Number);
      return new Date(a, m - 1, d);
    }
    const f = new Date(valor);
    return isNaN(f.getTime()) ? null : f;
  }
  function formatearFecha(valor){
    const f = parsearFecha(valor);
    return f ? f.toLocaleDateString('es-CO') : '-';
  }
  function formatearHora(valor){
    const f = parsearFecha(valor);
    if (!f || (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor))) return '';
    return f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
  function celdaFecha(valor){
    const hora = formatearHora(valor);
    return `<span class="td-fecha">${formatearFecha(valor)}${hora ? `<small>${hora}</small>` : ''}</span>`;
  }

  const PALABRAS_PROBLEMA  = ['rechaz', 'dano', 'danad', 'deterior', 'vencid', 'cancelad', 'inactiv', 'no apto'];
  const PALABRAS_PENDIENTE = ['pendiente', 'evaluacion', 'revision', 'observ'];

  function clasificarEstado(estado){
    const e = normalizar(estado);
    if (PALABRAS_PROBLEMA.some(p => e.includes(p)))  return 'warn';
    if (PALABRAS_PENDIENTE.some(p => e.includes(p))) return 'pend';
    return 'ok';
  }
  const pillEstado = estado => `<span class="pill ${clasificarEstado(estado)}">${escapeHTML(estado)}</span>`;

  let temporizadorToast;
  function mostrarToast(mensaje, tipo){
    const t = $('toast');
    t.textContent = mensaje;
    t.className = 'toast show ' + (tipo || '');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { t.className = 'toast'; }, 3000);
  }

  function mostrarAviso(texto){ $('avisoTexto').textContent = texto; $('aviso').classList.add('show'); }
  function ocultarAviso(){ $('aviso').classList.remove('show'); }

  // Promesa que falla si algo tarda más de 15 s
  function conLimite(promesa, ms){
    let id;
    const limite = new Promise((_, rechazar) => { id = setTimeout(() => rechazar(new Error('Tiempo de espera agotado')), ms || 15000); });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(id));
  }

  // ---------------------------------------------------------------
  // FILTRO DE ESCRITURA DEL BUSCADOR
  // (solo letras, números, espacios y guion; no deja escribir símbolos raros)
  // ---------------------------------------------------------------
  const L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
  const RE_BUSQUEDA = new RegExp('[^' + L + '0-9\\s\\-]', 'g');

  function filtrarBusqueda(campo){
    const antes = campo.value;
    const despues = antes.replace(RE_BUSQUEDA, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
    if (despues === antes) return;
    const pos = campo.selectionStart;
    campo.value = despues;
    if (pos !== null) {
      const nueva = Math.max(0, pos - (antes.length - despues.length));
      try { campo.setSelectionRange(nueva, nueva); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------
  // USUARIO Y ENCABEZADO
  // ---------------------------------------------------------------
  function pintarUsuario(){
    const u = usuarioActual;
    const nombre = (u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0] || 'Usuario').trim() || 'Usuario';
    const inicial = nombre.charAt(0).toUpperCase();
    $('topUserName').textContent = nombre;
    $('topAvatar').textContent   = inicial;
  }
  // ---------------------------------------------------------------
  // CACHÉ LOCAL (la página abre al instante con lo último visto)
  // ---------------------------------------------------------------
  const claveBase    = () => 'dsi_traza_base_' + usuarioActual.id;
  const claveTrazas  = () => 'dsi_traza_cache_' + usuarioActual.id;
  const claveRecient = () => 'dsi_traza_rec_' + usuarioActual.id;

  function leerJSON(clave, defecto){
    try { const v = JSON.parse(localStorage.getItem(clave) || 'null'); return v ?? defecto; }
    catch (e) { return defecto; }
  }
  function guardarJSON(clave, valor){
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
  }

  function obtenerCacheTraza(id){
    const k = String(id);
    if (memoria.has(k)) return memoria.get(k);
    const guardadas = leerJSON(claveTrazas(), {});
    const e = guardadas[k];
    if (e && e.d) { memoria.set(k, e); return e; }
    return null;
  }
  function guardarCacheTraza(id, d){
    const k = String(id);
    const entrada = { t: Date.now(), d: d };
    memoria.set(k, entrada);
    const guardadas = leerJSON(claveTrazas(), {});
    guardadas[k] = entrada;
    // Se conservan solo las más recientes para no llenar el almacenamiento
    const claves = Object.keys(guardadas).sort((a, b) => guardadas[b].t - guardadas[a].t);
    claves.slice(MAX_TRAZAS_GUARDADAS).forEach(c => delete guardadas[c]);
    guardarJSON(claveTrazas(), guardadas);
  }

  // ---------------------------------------------------------------
  // CARGA BASE: lista de productos (+ recepciones para notificaciones)
  // Dos consultas en paralelo y solo las columnas que se usan.
  // ---------------------------------------------------------------
  function construirIndice(){
    indice = productos.map(p => ({ p: p, n: normalizar(p.nombre), c: normalizar(p.nombre_cientifico) }));
  }

  function actualizarProveedoresDesdeRecepciones(registros){
    if (!Array.isArray(registros)) return;
    registros.forEach(r => {
      const id = r.producto_id ?? (Array.isArray(r.productos) ? r.productos[0]?.id : r.productos?.id);
      const prov = Array.isArray(r.proveedores) ? r.proveedores[0] : r.proveedores;
      if (id != null && prov?.nombre && !proveedorPorProducto.has(String(id))) {
        proveedorPorProducto.set(String(id), prov.nombre);
      }
    });
  }

  function proveedorProducto(prod){
    if (!prod) return 'Sin proveedor registrado';
    const desdeSeleccion = datosTraza?.recepciones?.[0];
    if (seleccionado && String(seleccionado.id) === String(prod.id) && desdeSeleccion) {
      const prov = Array.isArray(desdeSeleccion.proveedores) ? desdeSeleccion.proveedores[0] : desdeSeleccion.proveedores;
      if (prov?.nombre) {
        proveedorPorProducto.set(String(prod.id), prov.nombre);
        return prov.nombre;
      }
    }
    return proveedorPorProducto.get(String(prod.id)) || 'Sin proveedor registrado';
  }

  async function cargarBase(){
    if (cargandoBase) return;
    cargandoBase = true;
    let hayError = false;

    try {
      const [prod, rec] = await conLimite(Promise.all([
        supabaseClient.from('productos')
          .select('id,nombre,nombre_cientifico,categoria,fecha_captura,origen,estado')
          .order('nombre'),
        supabaseClient.from('recepciones')
          .select('id,producto_id,peso,estado_producto,fecha_recepcion,productos(id,nombre),proveedores(nombre)')
          .order('fecha_recepcion', { ascending: false, nullsFirst: false })
          .limit(100)
      ]));

      if (prod.error) { hayError = true; console.error('Error productos:', prod.error); }
      else { productos = prod.data || []; construirIndice(); }

      if (rec.error) console.error('Error recepciones (notificaciones):', rec.error);
      else {
        recepcionesNotif = rec.data || [];
        proveedorPorProducto.clear();
        actualizarProveedoresDesdeRecepciones(recepcionesNotif);
      }
    } catch (err) {
      hayError = true;
      console.error('Error cargando base:', err);
    }

    cargandoBase = false;
    baseLista = baseLista || productos.length > 0 || !hayError;

    if (hayError) {
      mostrarAviso('No se pudieron actualizar algunos datos. Revisa tu conexión.');
    } else {
      if (!seleccionado) ocultarAviso();
      guardarJSON(claveBase(), { productos: productos, recepciones: recepcionesNotif });
      ultimaActualizacion = Date.now();
    }

    pintarRecientes();
    renderNotificaciones();
    if ($('buscarProducto') === document.activeElement) mostrarSugerencias();
    abrirDesdeUrl();
  }

  // ---------------------------------------------------------------
  // BÚSQUEDA INSTANTÁNEA (todo local, sin ir al servidor)
  // ---------------------------------------------------------------
  function buscarCoincidencias(texto){
    const q = normalizar(texto);
    if (!q) return [];
    const exactos = [], inicio = [], contiene = [], cientifico = [];
    for (const e of indice) {
      if (e.n === q) exactos.push(e.p);
      else if (e.n.startsWith(q)) inicio.push(e.p);
      else if (e.n.includes(q)) contiene.push(e.p);
      else if (e.c && e.c.includes(q)) cientifico.push(e.p);
    }
    return exactos.concat(inicio, contiene, cientifico);
  }

  const campo = $('buscarProducto');
  const cajaSug = $('sugerencias');

  function mostrarSugerencias(){
    const texto = campo.value.trim();
    if (!texto) { cerrarSugerencias(); return; }

    if (!baseLista) {
      cajaSug.innerHTML = '<div class="sug-msg">Cargando productos...</div>';
      cajaSug.classList.add('show');
      campo.setAttribute('aria-expanded', 'true');
      return;
    }

    sugerenciasActuales = buscarCoincidencias(texto).slice(0, MAX_SUGERENCIAS);
    sugActiva = sugerenciasActuales.length ? 0 : -1;

    if (!sugerenciasActuales.length) {
      cajaSug.innerHTML = '<div class="sug-msg">No hay productos con ese nombre.</div>';
    } else {
      cajaSug.innerHTML = sugerenciasActuales.map((p, i) => `
        <div class="sug-item${i === sugActiva ? ' activo' : ''}" role="option" id="sug-${i}" data-i="${i}">
          <strong>${escapeHTML(p.nombre)}</strong>
          <span class="sug-proveedor">Proveedor: ${escapeHTML(proveedorProducto(p))}</span>
        </div>`).join('');
    }
    cajaSug.classList.add('show');
    campo.setAttribute('aria-expanded', 'true');
  }

  function cerrarSugerencias(){
    cajaSug.classList.remove('show');
    campo.setAttribute('aria-expanded', 'false');
    campo.removeAttribute('aria-activedescendant');
  }

  function marcarSugerencia(i){
    if (!sugerenciasActuales.length) return;
    sugActiva = (i + sugerenciasActuales.length) % sugerenciasActuales.length;
    cajaSug.querySelectorAll('.sug-item').forEach((el, idx) => el.classList.toggle('activo', idx === sugActiva));
    const el = $('sug-' + sugActiva);
    if (el) { campo.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
    programarPrecarga(sugerenciasActuales[sugActiva]);
  }

  campo.addEventListener('input', function(){
    filtrarBusqueda(campo);
    mostrarSugerencias();
  });
  campo.addEventListener('focus', mostrarSugerencias);

  campo.addEventListener('keydown', function(e){
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!cajaSug.classList.contains('show')) mostrarSugerencias(); else marcarSugerencia(sugActiva + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcarSugerencia(sugActiva - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); consultar(); }
    else if (e.key === 'Escape') { cerrarSugerencias(); }
  });

  // mousedown (y no click) para elegir antes de que el campo pierda el foco
  cajaSug.addEventListener('mousedown', function(e){
    const item = e.target.closest('.sug-item');
    if (!item) return;
    e.preventDefault();
    const p = sugerenciasActuales[Number(item.dataset.i)];
    if (p) seleccionar(p.id);
  });
  cajaSug.addEventListener('mouseover', function(e){
    const item = e.target.closest('.sug-item');
    if (!item) return;
    const p = sugerenciasActuales[Number(item.dataset.i)];
    if (p) programarPrecarga(p);
  });
  document.addEventListener('click', function(e){
    if (!cajaSug.contains(e.target) && e.target !== campo) cerrarSugerencias();
  });

  function consultar(){
    const texto = campo.value.trim();
    if (!texto) { mostrarToast('Escribe el nombre de un producto.', 'error'); campo.focus(); return; }
    if (!baseLista) { mostrarToast('Aún se están cargando los productos...', 'error'); return; }

    const lista = buscarCoincidencias(texto);
    if (!lista.length) { mostrarNoEncontrado(); return; }
    const elegido = sugerenciasActuales[sugActiva] && cajaSug.classList.contains('show') ? sugerenciasActuales[sugActiva] : lista[0];
    seleccionar(elegido.id, true);
  }
  $('btnBuscar').addEventListener('click', consultar);

  // ---------------------------------------------------------------
  // PRECARGA: mientras el usuario recorre las sugerencias, los datos del
  // producto ya se van pidiendo, así al elegirlo se muestran al instante.
  // ---------------------------------------------------------------
  let temporizadorPrecarga;
  function programarPrecarga(producto){
    clearTimeout(temporizadorPrecarga);
    if (!producto) return;
    const previo = obtenerCacheTraza(producto.id);
    if (previo && Date.now() - previo.t < FRESCO_MS) return;
    temporizadorPrecarga = setTimeout(() => { pedirTraza(producto.id); }, 180);
  }

  // ---------------------------------------------------------------
  // RECIENTES
  // ---------------------------------------------------------------
  function recordarReciente(id){
    const lista = leerJSON(claveRecient(), []).filter(x => String(x) !== String(id));
    lista.unshift(id);
    guardarJSON(claveRecient(), lista.slice(0, MAX_RECIENTES));
  }
  function pintarRecientes(){
    const cont = $('recientes');
    if (!usuarioActual || !baseLista) return;
    const ids = leerJSON(claveRecient(), []);
    const items = ids.map(id => productos.find(p => String(p.id) === String(id))).filter(Boolean);
    if (!items.length) { cont.classList.remove('show'); cont.innerHTML = ''; return; }
    cont.innerHTML = '<small>Recientes:</small>' + items.map(p =>
      `<button class="chip" type="button" data-id="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</button>`).join('');
    cont.classList.add('show');
  }
  $('recientes').addEventListener('click', function(e){
    const chip = e.target.closest('.chip');
    if (chip) seleccionar(chip.dataset.id);
  });
  $('recientes').addEventListener('mouseover', function(e){
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const p = productos.find(x => String(x.id) === chip.dataset.id);
    if (p) programarPrecarga(p);
  });

  // ---------------------------------------------------------------
  // TRAZABILIDAD: 3 consultas en paralelo, solo el producto elegido
  // ---------------------------------------------------------------
  function pedirTraza(id){
    const k = String(id);
    if (enVuelo.has(k)) return enVuelo.get(k);

    const promesa = (async () => {
      try {
        const [rec, alm, ven, cal] = await conLimite(Promise.all([
          supabaseClient.from('recepciones')
            .select('id,codigo_lote,peso,estado_producto,fecha_recepcion,proveedores(nombre)')
            .eq('producto_id', id)
            .order('fecha_recepcion', { ascending: false, nullsFirst: false })
            .limit(LIMITE),
          supabaseClient.from('almacenamientos')
            .select('id,recepcion_id,tipo,ubicacion,temperatura,estado_producto,fecha_almacenamiento,recepciones!almacenamientos_lote_producto_fkey(id,codigo_lote,fecha_recepcion,peso,proveedores(nombre))')
            .eq('producto_id', id)
            .order('fecha_almacenamiento', { ascending: false, nullsFirst: false })
            .limit(LIMITE),
          supabaseClient.from('ventas')
            .select('id,recepcion_id,cantidad,cliente,tipo_venta,canal_venta,destino,fecha_venta,recepciones!ventas_lote_producto_fkey(id,codigo_lote,fecha_recepcion,peso,proveedores(nombre))')
            .eq('producto_id', id)
            .order('fecha_venta', { ascending: false, nullsFirst: false })
            .limit(LIMITE),
          supabaseClient.from('controles_calidad')
            .select('id,recepcion_id,resultado,estado_revision,fecha_control')
            .eq('producto_id', id)
            .order('fecha_control', { ascending: false, nullsFirst: false })
            .limit(LIMITE)
        ]));

        const fallos = [];
        if (rec.error) { fallos.push('recepciones'); console.error('Error recepciones:', rec.error); }
        if (alm.error) { fallos.push('almacenamiento'); console.error('Error almacenamientos:', alm.error); }
        if (ven.error) { fallos.push('ventas'); console.error('Error ventas:', ven.error); }
        if (cal.error) { fallos.push('calidad'); console.error('Error calidad:', cal.error); }

        // Historial de cambios de este producto (si falla, la trazabilidad sigue funcionando)
        let historial = [];
        try {
          const h = await conLimite(supabaseClient.from('auditoria')
            .select('id,tabla,registro_id,accion,fecha,anterior,nuevo')
            .in('tabla', ['recepciones', 'almacenamientos', 'ventas', 'controles_calidad'])
            .or('nuevo->>producto_id.eq.' + id + ',anterior->>producto_id.eq.' + id)
            .order('fecha', { ascending: false })
            .limit(60));
          if (!h.error) historial = h.data || [];
        } catch (e) { /* sin historial */ }

        const d = { recepciones: rec.data || [], almacenamientos: alm.data || [], ventas: ven.data || [], calidad: cal.data || [], historial: historial };
        if (!fallos.length) guardarCacheTraza(id, d);
        return { d: d, fallos: fallos };
      } catch (err) {
        console.error('Error cargando trazabilidad:', err);
        return { d: null, fallos: ['todo'] };
      }
    })();

    enVuelo.set(k, promesa);
    promesa.then(() => enVuelo.delete(k));
    return promesa;
  }

  async function seleccionar(id, forzar){
    const prod = productos.find(p => String(p.id) === String(id));
    if (!prod) return;

    const token = ++tokenSel;
    const mismo = seleccionado && String(seleccionado.id) === String(prod.id);
    seleccionado = prod;

    campo.value = prod.nombre;
    cerrarSugerencias();
    campo.blur();
    pintarCabecera(prod);
    recordarReciente(prod.id);
    pintarRecientes();
    try { history.replaceState(null, '', '?producto=' + encodeURIComponent(prod.id)); } catch (e) {}
    ocultarAviso();

    // 1) Si ya se había consultado, se muestra al instante lo guardado
    const previo = obtenerCacheTraza(prod.id);
    firmaTraza = '';
    if (previo) {
      if (!mismo) vistaActual = primeraVistaConDatos(previo.d);
      pintarTraza(prod, previo.d);
    } else {
      vistaActual = 'lotes';
      pintarCargando();
    }

    // 2) Si es reciente, no hace falta volver a pedirlo
    if (previo && !forzar && Date.now() - previo.t < FRESCO_MS) return;

    // 3) Se piden los datos frescos
    const r = await pedirTraza(prod.id);
    if (token !== tokenSel) return;   // el usuario ya eligió otro producto

    if (r.d === null) {
      if (!previo) pintarErrorTraza();
      mostrarAviso('No se pudo consultar la trazabilidad. Revisa tu conexión.');
      return;
    }
    if (r.fallos.length) mostrarAviso('No se pudieron cargar: ' + r.fallos.join(', ') + '.');
    else ocultarAviso();

    if (!previo && !mismo) vistaActual = primeraVistaConDatos(r.d);
    pintarTraza(prod, r.d);
  }

  function primeraVistaConDatos(d){
    if (d.recepciones.length) return 'lotes';
    return ['almacenamientos', 'ventas'].find(v => d[v].length) || 'lotes';
  }

  function mostrarNoEncontrado(){
    tokenSel++;
    seleccionado = null;
    datosTraza = null;
    firmaTraza = '';
    $('productoNombre').textContent = 'Producto no encontrado';
    $('productoDetalle').textContent = 'No existe un producto registrado con ese nombre.';
    const est = $('productoEstado');
    est.textContent = 'Sin resultados';
    est.className = 'product-status';
    cerrarSugerencias();
    pintarTimeline(null);
    pintarContadores(null);
    pintarTabla();
    pintarQR(null, null);
  }

  // ---------------------------------------------------------------
  // PINTAR: cabecera, línea de tiempo y tabla
  // ---------------------------------------------------------------
  function pintarCabecera(prod){
    $('productoNombre').textContent = prod.nombre;
    let detalle = 'Proveedor: ' + proveedorProducto(prod) + ' · Categoría: ' + (prod.categoria || 'Sin categoría');
    if (prod.origen) detalle += ' · Origen: ' + prod.origen;
    if (prod.nombre_cientifico) detalle += ' · Nombre científico: ' + prod.nombre_cientifico;
    $('productoDetalle').textContent = detalle;

    const estado = prod.estado || 'Activo';
    const est = $('productoEstado');
    est.textContent = estado;
    est.className = 'product-status ' + (clasificarEstado(estado) === 'warn' ? 'warn' : 'ok');
  }

  const ICONOS = {
    captura: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" stroke="currentColor" stroke-width="1.8"/></svg>',
    recepcion: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="4" y="7" width="16" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/></svg>',
    calidad: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    almacenamiento: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 9.5 12 4l9 5.5V20H3V9.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    venta: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="20" r="1.2" fill="currentColor"/><circle cx="17" cy="20" r="1.2" fill="currentColor"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 1.9 1.6h7.6a2 2 0 0 0 1.9-1.4L21 7H6" stroke="currentColor" stroke-width="1.8"/></svg>'
  };

  const TEXTO_PENDIENTE = {
    captura: 'Información de captura y origen del producto.',
    recepcion: 'Registro del ingreso, proveedor, peso y estado del producto.',
    calidad: 'Control de calidad del lote: color, olor, textura y revisión.',
    almacenamiento: 'Seguimiento de la ubicación y condiciones de almacenamiento.',
    venta: 'Registro de la venta y salida del producto.'
  };

  function conteo(n){ return n >= LIMITE ? LIMITE + ' o más' : String(n); }

  function construirEtapas(prod, d){
    const rec = d.recepciones, alm = d.almacenamientos, ven = d.ventas;
    const etapas = [];

    // Captura
    const tieneCaptura = !!prod.fecha_captura;
    etapas.push({
      icono: ICONOS.captura, titulo: 'Captura', hecho: tieneCaptura,
      fecha: tieneCaptura ? formatearFecha(prod.fecha_captura) : 'Sin registro',
      texto: 'Producto registrado con origen: ' + (prod.origen || 'sin información de origen') + '.'
    });

    // Recepción
    if (rec.length) {
      const total = rec.reduce((s, r) => s + (Number(r.peso) || 0), 0);
      const prov = rec[0].proveedores;
      const nombreProv = (Array.isArray(prov) ? prov[0] : prov)?.nombre || 'sin proveedor';
      etapas.push({
        icono: ICONOS.recepcion, titulo: 'Recepción', hecho: true,
        fecha: formatearFecha(rec[0].fecha_recepcion),
        texto: `${conteo(rec.length)} recepción(es) · ${fmtPeso(total)} recibidos · Última: ${nombreProv}, ${rec[0].estado_producto || 'Recibido'}.`
      });
    } else {
      etapas.push({ icono: ICONOS.recepcion, titulo: 'Recepción', hecho: false, fecha: 'Pendiente', texto: 'El producto todavía no tiene una recepción registrada.' });
    }

    // Control de calidad
    const cal = d.calidad || [];
    if (cal.length) {
      const c = cal[0];
      etapas.push({
        icono: ICONOS.calidad, titulo: 'Control de calidad', hecho: true,
        fecha: formatearFecha(c.fecha_control),
        texto: `${conteo(cal.length)} control(es) · Último: ${c.resultado || 'Pendiente'}${c.estado_revision ? ' (revisión: ' + String(c.estado_revision).toLowerCase() + ')' : ''}.`
      });
    } else {
      etapas.push({ icono: ICONOS.calidad, titulo: 'Control de calidad', hecho: false, fecha: 'Pendiente', texto: 'Todavía no hay controles de calidad para este producto.' });
    }

    // Almacenamiento
    if (alm.length) {
      const a = alm[0];
      const temp = (a.temperatura !== null && a.temperatura !== undefined && a.temperatura !== '')
        ? ' a ' + Number(a.temperatura).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' °C' : '';
      etapas.push({
        icono: ICONOS.almacenamiento, titulo: 'Almacenamiento', hecho: true,
        fecha: formatearFecha(a.fecha_almacenamiento),
        texto: `${conteo(alm.length)} registro(s) · Último: ${a.tipo || 'sin tipo'} en ${a.ubicacion || 'ubicación sin registrar'}${temp}.`
      });
    } else {
      etapas.push({ icono: ICONOS.almacenamiento, titulo: 'Almacenamiento', hecho: false, fecha: 'Pendiente', texto: 'Todavía no hay registros de almacenamiento para este producto.' });
    }

    // Venta
    if (ven.length) {
      const unidades = ven.reduce((s, v) => s + (Number(v.cantidad) || 0), 0);
      etapas.push({
        icono: ICONOS.venta, titulo: 'Venta', hecho: true,
        fecha: formatearFecha(ven[0].fecha_venta),
        texto: `${conteo(ven.length)} venta(s) · ${fmtNumero(unidades)} unidades · Último cliente: ${ven[0].cliente || 'sin nombre'}.`
      });
    } else {
      etapas.push({ icono: ICONOS.venta, titulo: 'Venta', hecho: false, fecha: 'Pendiente', texto: 'Todavía no hay ventas registradas para este producto.' });
    }

    return etapas;
  }

  // etapas = null → muestra la línea de tiempo vacía (sin producto)
  function pintarTimeline(etapas, cargando){
    const tl = $('timeline');
    tl.classList.toggle('cargando', !!cargando);

    const base = [
      { icono: ICONOS.captura, titulo: 'Captura', clave: 'captura' },
      { icono: ICONOS.recepcion, titulo: 'Recepción', clave: 'recepcion' },
      { icono: ICONOS.calidad, titulo: 'Control de calidad', clave: 'calidad' },
      { icono: ICONOS.almacenamiento, titulo: 'Almacenamiento', clave: 'almacenamiento' },
      { icono: ICONOS.venta, titulo: 'Venta', clave: 'venta' }
    ];
    const lista = etapas || base.map(b => ({ icono: b.icono, titulo: b.titulo, hecho: false, fecha: 'Pendiente', texto: TEXTO_PENDIENTE[b.clave] }));

    // La última etapa completada se marca como "actual"
    let actual = -1;
    lista.forEach((e, i) => { if (e.hecho) actual = i; });

    tl.innerHTML = lista.map((e, i) => {
      const estado = !e.hecho ? 'pending' : (i === actual ? 'current' : 'done');
      return `<div class="timeline-item">
        <div class="timeline-circle ${estado}">${e.icono}</div>
        <div class="timeline-content">
          <div class="timeline-top">
            <h4>${escapeHTML(e.titulo)}${estado === 'current' ? '<span class="etapa-actual">Etapa actual</span>' : ''}</h4>
            <span class="timeline-date">${escapeHTML(e.fecha)}</span>
          </div>
          <p>${escapeHTML(e.texto)}</p>
        </div>
      </div>`;
    }).join('');
  }

  function pintarCargando(){
    datosTraza = null;
    pintarQR(null, null);
    pintarTimeline(null, true);
    pintarContadores(null);
    $('tablaHead').innerHTML = '';
    $('tablaBody').innerHTML = '<tr class="vacio"><td colspan="6" class="empty">Cargando información...</td></tr>';
  }

  function pintarErrorTraza(){
    datosTraza = null;
    pintarQR(null, null);
    pintarTimeline(null);
    pintarContadores(null);
    $('tablaHead').innerHTML = '';
    $('tablaBody').innerHTML = '<tr class="vacio"><td colspan="6" class="empty">No se pudo cargar la información de este producto.</td></tr>';
  }

  function pintarTraza(prod, d){
    d.calidad = d.calidad || [];
    d.historial = d.historial || [];
    // Si los datos son idénticos a los ya dibujados, no se repite el trabajo
    const firma = prod.id + '|' + vistaActual + '|' + JSON.stringify(d);
    if (firma === firmaTraza) return;
    firmaTraza = firma;

    datosTraza = d;
    actualizarProveedoresDesdeRecepciones(d.recepciones);
    pintarCabecera(prod);
    pintarTimeline(construirEtapas(prod, d));
    pintarContadores(d);
    pintarTabla(true);
    pintarQR(prod, d);
  }

  // ---------------------------------------------------------------
  // PESTAÑAS Y TABLA (una sola tabla; en celular se ve como tarjetas)
  // ---------------------------------------------------------------
  const proveedorDe = r => (Array.isArray(r.proveedores) ? r.proveedores[0] : r.proveedores)?.nombre || 'Sin proveedor';

  // --- Ayudas para la vista por lote (usan los datos ya cargados del producto) ---
  const delLote = (lista, r) => (lista || []).filter(x => String(x.recepcion_id) === String(r.id));
  const codigoDeRecepcion = id => {
    const r = (datosTraza.recepciones || []).find(x => String(x.id) === String(id));
    return r ? (r.codigo_lote || 'Sin código') : 'Sin lote vinculado';
  };
  const tagLote = r => '<span class="lote-tag">' + escapeHTML(r.codigo_lote || 'Sin código') + '</span>';
  const vacioGris = t => '<span style="color:#9AB0C9">' + t + '</span>';
  const TABLAS_H = { recepciones: 'Recepción', almacenamientos: 'Almacenamiento', ventas: 'Venta', controles_calidad: 'Control de calidad' };
  const ACCIONES_H = { INSERT: 'Registró', UPDATE: 'Modificó', DELETE: 'Eliminó' };
  function detalleH(h){
    const x = h.nuevo || h.anterior || {};
    const kg = v => (v !== null && v !== undefined && v !== '') ? fmtPeso(Number(v)) : '';
    let partes = [];
    if (h.tabla === 'recepciones') partes = [x.codigo_lote, kg(x.peso), x.estado_producto];
    else if (h.tabla === 'almacenamientos') partes = [x.tipo, x.ubicacion, (x.temperatura !== null && x.temperatura !== undefined && x.temperatura !== '') ? x.temperatura + ' °C' : ''];
    else if (h.tabla === 'ventas') partes = [kg(x.cantidad), x.cliente];
    else if (h.tabla === 'controles_calidad') partes = [x.resultado, x.estado_revision ? 'revisión: ' + x.estado_revision : ''];
    return escapeHTML(partes.filter(Boolean).join(' · ') || '-');
  }

  const VISTAS = {
    lotes: {
      vacio: 'Este producto no tiene lotes. Registra una recepción para crear el primero.',
      filas: d => d.recepciones,
      cols: [
        { t: 'Lote', v: r => tagLote(r) },
        { t: 'Proveedor', v: r => escapeHTML(proveedorDe(r)) },
        { t: 'Recibido', v: r => celdaFecha(r.fecha_recepcion) },
        { t: 'Calidad', v: r => {
            const c = delLote(datosTraza.calidad, r)[0];
            return c ? pillEstado(c.resultado || 'Pendiente') + '<small>Revisión: ' + escapeHTML(c.estado_revision || 'Pendiente') + '</small>'
                     : '<span class="pill pend">Sin control</span>';
        } },
        { t: 'Almacenamiento', v: r => {
            const x = delLote(datosTraza.almacenamientos, r)[0];
            if (!x) return '<span class="pill pend">Sin registro</span>';
            const temp = (x.temperatura !== null && x.temperatura !== undefined && x.temperatura !== '') ? ' · ' + Number(x.temperatura).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' °C' : '';
            return escapeHTML((x.tipo || '-') + ' · ' + (x.ubicacion || '-') + temp);
        } },
        { t: 'Vendido / disponible', v: r => {
            const vendido = delLote(datosTraza.ventas, r).reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
            return escapeHTML(fmtPeso(vendido) + ' / ' + fmtPeso(Math.max(0, (Number(r.peso) || 0) - vendido)));
        } },
        { t: 'Clientes que lo recibieron', v: r => {
            const nombres = Array.from(new Set(delLote(datosTraza.ventas, r).map(x => x.cliente).filter(Boolean)));
            return nombres.length ? escapeHTML(nombres.join(', ')) : vacioGris('Aún sin ventas');
        } }
      ]
    },
    calidad: {
      vacio: 'Este producto no tiene controles de calidad registrados.',
      cols: [
        { t: 'Lote', v: r => r.recepcion_id ? '<span class="lote-tag">' + escapeHTML(codigoDeRecepcion(r.recepcion_id)) + '</span>' : vacioGris('Sin lote vinculado') },
        { t: 'Resultado', v: r => pillEstado(r.resultado || 'Pendiente') },
        { t: 'Revisión', v: r => pillEstado(r.estado_revision || 'Pendiente') },
        { t: 'Fecha', v: r => celdaFecha(r.fecha_control) }
      ]
    },
    historial: {
      vacio: 'Todavía no hay cambios registrados. El historial empieza a guardarse desde que se activó.',
      cols: [
        { t: 'Fecha', v: r => celdaFecha(r.fecha) },
        { t: 'Acción', v: r => escapeHTML(ACCIONES_H[r.accion] || r.accion) },
        { t: 'Registro', v: r => escapeHTML(TABLAS_H[r.tabla] || r.tabla) },
        { t: 'Detalle', v: r => detalleH(r) }
      ]
    },
    recepciones: {
      vacio: 'Este producto no tiene recepciones registradas.',
      cols: [
        { t: 'Lote', v: r => tagLote(r) },
        { t: 'Proveedor', v: r => escapeHTML(proveedorDe(r)) },
        { t: 'Peso', v: r => fmtPeso(Number(r.peso) || 0) },
        { t: 'Estado', v: r => pillEstado(r.estado_producto || 'Recibido') },
        { t: 'Fecha de recepción', v: r => celdaFecha(r.fecha_recepcion) }
      ]
    },
    almacenamientos: {
      vacio: 'Este producto no tiene registros de almacenamiento.',
      cols: [
        { t: 'Lote / proveedor', v: r => { const l = Array.isArray(r.recepciones) ? r.recepciones[0] : r.recepciones; const p = l && (Array.isArray(l.proveedores) ? l.proveedores[0] : l.proveedores); return l ? escapeHTML((l.codigo_lote || (l.fecha_recepcion ? formatearFecha(l.fecha_recepcion) : 'Lote')) + ' · ' + (p?.nombre || 'Sin proveedor')) : 'Sin lote vinculado'; } },
        { t: 'Tipo', v: r => `<span class="pill ${normalizar(r.tipo) === 'refrigerado' ? 'refrigerado' : 'congelado'}">${escapeHTML(r.tipo || '-')}</span>` },
        { t: 'Ubicación', v: r => escapeHTML(r.ubicacion || '-') },
        { t: 'Temperatura', v: r => (r.temperatura !== null && r.temperatura !== undefined && r.temperatura !== '')
            ? escapeHTML(Number(r.temperatura).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' °C') : '-' },
        { t: 'Estado', v: r => pillEstado(r.estado_producto || '-') },
        { t: 'Fecha', v: r => celdaFecha(r.fecha_almacenamiento) }
      ]
    },
    ventas: {
      vacio: 'Este producto no tiene ventas registradas.',
      cols: [
        { t: 'Lote / proveedor', v: r => { const l = Array.isArray(r.recepciones) ? r.recepciones[0] : r.recepciones; const p = l && (Array.isArray(l.proveedores) ? l.proveedores[0] : l.proveedores); return l ? escapeHTML((l.codigo_lote || (l.fecha_recepcion ? formatearFecha(l.fecha_recepcion) : 'Lote')) + ' · ' + (p?.nombre || 'Sin proveedor')) : 'Sin lote vinculado'; } },
        { t: 'Cantidad', v: r => fmtNumero(Number(r.cantidad) || 0) },
        { t: 'Cliente', v: r => escapeHTML(r.cliente || '-') },
        { t: 'Tipo', v: r => `<span class="pill ${normalizar(r.tipo_venta) === 'local' ? 'local' : 'distribucion'}">${escapeHTML(r.tipo_venta || '-')}</span>` },
        { t: 'Canal', v: r => escapeHTML(r.canal_venta || '-') },
        { t: 'Destino', v: r => escapeHTML(r.destino || '-') },
        { t: 'Fecha', v: r => celdaFecha(r.fecha_venta) }
      ]
    }
  };

  function pintarContadores(d){
    document.querySelectorAll('[data-count]').forEach(el => {
      const lista = d ? (d[el.dataset.count === 'lotes' ? 'recepciones' : el.dataset.count] || []) : null;
      el.textContent = lista ? (lista.length >= LIMITE ? LIMITE + '+' : lista.length) : '';
    });
    document.querySelectorAll('.tab').forEach(t => {
      const activa = t.dataset.vista === vistaActual;
      t.classList.toggle('activa', activa);
      t.setAttribute('aria-selected', String(activa));
    });
  }

  function pintarTabla(animar){
    const vista = VISTAS[vistaActual];
    const head = $('tablaHead'), body = $('tablaBody');

    if (!datosTraza) {
      head.innerHTML = '';
      body.innerHTML = '<tr class="vacio"><td colspan="6" class="empty">' +
        (seleccionado ? 'Cargando información...' : 'Selecciona un producto para consultar su información.') + '</td></tr>';
      return;
    }

    const filas = vista.filas ? vista.filas(datosTraza) : (datosTraza[vistaActual] || []);
    if (!filas.length) {
      head.innerHTML = '';
      body.innerHTML = `<tr class="vacio"><td colspan="6" class="empty">${vista.vacio}</td></tr>`;
      return;
    }

    head.innerHTML = '<tr>' + vista.cols.map(c => `<th>${c.t}</th>`).join('') + '</tr>';
    body.innerHTML = filas.map((r, i) => {
      const anim = animar && !reducirMovimiento ? ` class="row-in" style="animation-delay:${Math.min(i, 10) * 25}ms"` : '';
      return `<tr${anim}>` + vista.cols.map(c => `<td data-label="${c.t}">${c.v(r)}</td>`).join('') + '</tr>';
    }).join('');
  }

  $('tabs').addEventListener('click', function(e){
    const tab = e.target.closest('.tab');
    if (!tab || tab.dataset.vista === vistaActual) return;
    vistaActual = tab.dataset.vista;
    firmaTraza = '';           // la vista cambió: se vuelve a dibujar la tabla
    pintarContadores(datosTraza);
    pintarTabla(true);
    if (datosTraza) firmaTraza = (seleccionado ? seleccionado.id : '') + '|' + vistaActual + '|' + JSON.stringify(datosTraza);
  });

  // ---------------------------------------------------------------
  // NOTIFICACIONES (comparten el estado de "leídas" con las demás páginas)
  // ---------------------------------------------------------------
  const claveLeidas = () => 'dsi_notif_leidas_' + usuarioActual.id;

  function leerLeidas(){
    try { return new Set(JSON.parse(localStorage.getItem(claveLeidas()) || '[]')); }
    catch (e) { return new Set(); }
  }
  function guardarLeidas(set){
    try { localStorage.setItem(claveLeidas(), JSON.stringify([...set].slice(-300))); } catch (e) {}
  }

  function construirNotificaciones(){
    const lista = [];

    recepcionesNotif.forEach(r => {
      const estado = r.estado_producto || 'Recibido';
      const clase = clasificarEstado(estado);
      if (clase === 'ok') return;
      const prod = Array.isArray(r.productos) ? r.productos[0] : r.productos;
      lista.push({
        key: `rec:${r.id}:${normalizar(estado)}`,
        tipo: clase,
        titulo: `Recepción ${estado.toLowerCase()}`,
        texto: `${prod?.nombre || 'Producto'} — ${fmtPeso(Number(r.peso) || 0)}`,
        fecha: formatearFecha(r.fecha_recepcion),
        href: 'recepciones.html?id=' + encodeURIComponent(r.id)
      });
    });

    productos.forEach(p => {
      if (normalizar(p.estado) !== 'inactivo') return;
      lista.push({
        key: `prod:${p.id}`,
        tipo: 'info',
        titulo: 'Producto inactivo',
        texto: p.nombre || 'Producto',
        fecha: '',
        href: 'productos.html?id=' + encodeURIComponent(p.id)
      });
    });

    return lista;
  }

  function actualizarGlobo(){
    const leidas = leerLeidas();
    const total = notifsActuales.filter(n => !leidas.has(n.key)).length;
    const globo = $('notificationBadge');
    globo.textContent = total > 9 ? '9+' : String(total);
    globo.classList.toggle('show', total > 0);
    $('notificationBtn').setAttribute('aria-label', total ? `Notificaciones (${total} sin leer)` : 'Notificaciones');
    $('markAllRead').style.display = total ? '' : 'none';
  }

  function iconoNotif(tipo){
    return tipo === 'info'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="8" r=".9" fill="currentColor"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>';
  }

  function renderNotificaciones(){
    if (!usuarioActual) return;
    const leidas = leerLeidas();
    notifsActuales = construirNotificaciones().filter(n => !leidas.has(n.key)).slice(0, 30);
    actualizarGlobo();

    const cont = $('notificationContent');
    if (!notifsActuales.length) {
      cont.innerHTML = '<div class="notification-empty">No tienes notificaciones nuevas.</div>';
      return;
    }

    cont.innerHTML = notifsActuales.map((n, i) => `
      <a class="notification-item" href="${escapeHTML(n.href)}" data-i="${i}">
        <div class="ni-icon t-${n.tipo}">${iconoNotif(n.tipo)}</div>
        <div class="ni-body">
          <strong>${escapeHTML(n.titulo)}</strong>
          <span>${escapeHTML(n.texto)}</span>
          ${n.fecha && n.fecha !== '-' ? `<em>${escapeHTML(n.fecha)}</em>` : ''}
        </div>
        <span class="ni-go">›</span>
      </a>`).join('');
  }

  $('notificationContent').addEventListener('click', function(e){
    const item = e.target.closest('.notification-item');
    if (!item) return;
    e.preventDefault();

    const n = notifsActuales[Number(item.dataset.i)];
    if (!n) return;

    const leidas = leerLeidas();
    leidas.add(n.key);
    guardarLeidas(leidas);
    actualizarGlobo();

    item.classList.add('removing');
    setTimeout(function(){ window.location.href = n.href; }, 170);
  });

  $('markAllRead').addEventListener('click', function(){
    const leidas = leerLeidas();
    construirNotificaciones().forEach(n => leidas.add(n.key));
    guardarLeidas(leidas);
    renderNotificaciones();
  });

  const panel = $('notificationPanel');
  const btnNotif = $('notificationBtn');

  function cerrarPanel(){
    panel.classList.remove('show');
    btnNotif.setAttribute('aria-expanded', 'false');
  }
  btnNotif.addEventListener('click', function(e){
    e.stopPropagation();
    const abierto = panel.classList.toggle('show');
    btnNotif.setAttribute('aria-expanded', String(abierto));
  });
  $('closeNotifications').addEventListener('click', cerrarPanel);
  document.addEventListener('click', function(e){
    if (!panel.contains(e.target) && !btnNotif.contains(e.target)) cerrarPanel();
  });

  // ---------------------------------------------------------------
  // BUSCADOR (productos y proveedores, con los datos ya cargados)
  // ---------------------------------------------------------------
  const buscador = $('buscador');
  const cajaResultados = $('resultadosBusqueda');

  function cerrarBusqueda(){ cajaResultados.classList.remove('show'); cajaResultados.innerHTML = ''; }

  function buscar(){
    const q = normalizar(buscador.value);
    if (!q) { cerrarBusqueda(); return; }

    const prods = productos
      .filter(p => normalizar(p.nombre).includes(q) || normalizar(p.nombre_cientifico).includes(q))
      .slice(0, 5);
    const provs = proveedoresBusqueda
      .filter(p => normalizar(p.nombre).includes(q))
      .slice(0, 4);

    let html = '';
    if (prods.length) {
      html += '<div class="sr-grupo">Productos</div>' + prods.map(p => `
        <a class="sr-item" href="productos.html?id=${encodeURIComponent(p.id)}" role="option">
          <span class="sr-ic" style="background:var(--g-azul)"><svg class="i" style="width:17px;height:17px"><use href="#i-box"/></svg></span>
          <span><b>${escapeHTML(p.nombre)}</b><span class="sub">${escapeHTML(p.nombre_cientifico || p.categoria || '')}</span></span>
        </a>`).join('');
    }
    if (provs.length) {
      html += '<div class="sr-grupo">Proveedores</div>' + provs.map(p => `
        <a class="sr-item" href="proveedores.html?id=${encodeURIComponent(p.id)}" role="option">
          <span class="sr-ic" style="background:var(--g-morado)"><svg class="i" style="width:17px;height:17px"><use href="#i-users"/></svg></span>
          <span><b>${escapeHTML(p.nombre)}</b><span class="sub">${escapeHTML(p.estado || '')}</span></span>
        </a>`).join('');
    }
    if (!html) html = '<div class="sr-vacio">No encontramos resultados para "' + escapeHTML(buscador.value.trim()) + '".</div>';

    cajaResultados.innerHTML = html;
    cajaResultados.classList.add('show');
  }

  buscador.addEventListener('input', buscar);
  buscador.addEventListener('focus', buscar);
  buscador.addEventListener('keydown', function(e){
    const items = [...cajaResultados.querySelectorAll('.sr-item')];
    if (e.key === 'Enter') {
      if (items[0]) { e.preventDefault(); window.location.href = items[0].getAttribute('href'); }
    } else if (e.key === 'ArrowDown' && items[0]) {
      e.preventDefault(); items[0].focus();
    }
  });
  cajaResultados.addEventListener('keydown', function(e){
    const items = [...cajaResultados.querySelectorAll('.sr-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? items[i - 1] : buscador).focus(); }
  });
  document.addEventListener('click', function(e){
    if (!$('search').contains(e.target)) cerrarBusqueda();
  });

  function actualizarScroll(){
    document.body.style.overflow = $('fan').classList.contains('open') ? 'hidden' : '';
  }

  // ---------------------------------------------------------------
  // MENÚ "MÁS" EN CELULAR: iconos flotantes en vertical
  // ---------------------------------------------------------------
  const fan = $('fan');
  const fanBtn = $('fanBtn');

  function abrirFan(){
    fan.classList.add('open');
    fanBtn.classList.add('open');
    fanBtn.setAttribute('aria-expanded', 'true');
    $('fanBtnLabel').textContent = 'Cerrar';
    actualizarScroll();
  }
  function cerrarFan(){
    fan.classList.remove('open');
    fanBtn.classList.remove('open');
    fanBtn.setAttribute('aria-expanded', 'false');
    $('fanBtnLabel').textContent = 'Más';
    actualizarScroll();
  }

  fanBtn.addEventListener('click', () => fan.classList.contains('open') ? cerrarFan() : abrirFan());
  $('fanOverlay').addEventListener('click', cerrarFan);
  window.addEventListener('resize', () => { if (window.innerWidth > 1000) cerrarFan(); });

  // Escape: cierra lo que esté abierto (de lo más reciente a lo más antiguo)
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    cerrarPanel();
    cerrarFan();
    cerrarBusqueda();
  });


  // ---------------------------------------------------------------
  // CÓDIGO QR PARA CLIENTES
  // Cada lote (recepción) tiene su propio enlace. La página pública del lote
  // (trazabilidad-publica.html) muestra solo: origen, fechas, temperatura y
  // resultado de calidad. Nunca datos de ventas.
  // ---------------------------------------------------------------
  let urlQR = '';

  function qrSVG(texto){
    const qr = new window.QRCodeLib(-1, window.QRCodeLib.EC.M);
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount(), margen = 2, celda = 1;
    const total = n + margen * 2;
    let rect = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) rect += `M${c + margen} ${r + margen}h1v1h-1z`;
      }
    }
    return `<svg viewBox="0 0 ${total} ${total}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código QR del lote"><rect width="${total}" height="${total}" fill="#fff"/><path d="${rect}" fill="#062B5B"/></svg>`;
  }

  function pintarQR(prod, d){
    const cont = $('qrBody');
    const sel = $('loteSel');

    if (!prod || !d) {
      sel.innerHTML = '';
      sel.disabled = true;
      $('qrNota').hidden = true;
      cont.innerHTML = '<div class="qr-vacio">Selecciona un producto para generar su código QR.</div>';
      urlQR = '';
      return;
    }

    const lotes = d.recepciones;
    if (!lotes.length) {
      sel.innerHTML = '';
      sel.disabled = true;
      $('qrNota').hidden = true;
      cont.innerHTML = '<div class="qr-vacio">Este producto aún no tiene lotes. Registra una recepción para generar su código QR.</div>';
      urlQR = '';
      return;
    }

    // Si el usuario ya había elegido un lote de este producto, se conserva
    const elegido = sel.dataset.producto === String(prod.id) && lotes.some(r => String(r.id) === sel.value)
      ? sel.value : String(lotes[0].id);
    sel.dataset.producto = String(prod.id);
    sel.disabled = false;
    sel.innerHTML = lotes.map(r => {
      const etiqueta = (r.codigo_lote ? r.codigo_lote + ' · ' : '') + formatearFecha(r.fecha_recepcion) + ' · ' + fmtPeso(Number(r.peso) || 0);
      return `<option value="${escapeHTML(r.id)}"${String(r.id) === elegido ? ' selected' : ''}>${escapeHTML(etiqueta)}</option>`;
    }).join('');

    const url = new URL('trazabilidad-publica.html', window.location.href);
    url.searchParams.set('lote', elegido);
    urlQR = url.toString();

    cont.innerHTML = `
      <div class="qr-frame"><div class="qr-inner">${qrSVG(urlQR)}<div class="qr-logo"><img src="logo-emblema.png" alt=""></div></div></div>
      <div class="qr-url" id="qrUrl">${escapeHTML(urlQR)}</div>
      <div class="qr-actions">
        <button type="button" class="bg" id="btnCopiar">Copiar enlace</button>
        <button type="button" class="bg" id="btnDescargar">Descargar</button>
        <button type="button" class="bp" id="btnImprimir">Imprimir etiqueta</button>
      </div>`;
    $('qrNota').hidden = false;
  }

  $('loteSel').addEventListener('change', function(){
    if (seleccionado && datosTraza) pintarQR(seleccionado, datosTraza);
  });

  $('qrBody').addEventListener('click', async function(e){
    if (e.target.closest('#btnCopiar')) {
      try { await navigator.clipboard.writeText(urlQR); mostrarToast('Enlace copiado.', 'success'); }
      catch (err) { mostrarToast('No se pudo copiar. Selecciona el enlace y cópialo.', 'error'); }
    }
    else if (e.target.closest('#btnDescargar')) {
      const svg = $('qrBody').querySelector('svg');
      if (!svg) return;
      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qr-lote-' + ($('loteSel').value || 'deepsea') + '.svg';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    else if (e.target.closest('#btnImprimir')) {
      const svg = $('qrBody').querySelector('svg');
      const w = window.open('', '_blank');
      if (!w || !svg) { mostrarToast('Tu navegador bloqueó la ventana de impresión.', 'error'); return; }
      const nombre = escapeHTML($('productoNombre').textContent);
      const lote = escapeHTML($('loteSel').options[$('loteSel').selectedIndex]?.textContent || '');
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta de lote</title>
        <link rel="stylesheet" href="css/trazabilidad-3.css"></head>
        <body><h1>${nombre}</h1><p>${lote}</p><div class="qr">${svg.outerHTML}</div>
        <p>Escanea para conocer el recorrido de tu producto</p>
        <p>Deep Sea Intelligence · Gestión de recursos marinos</p>
        <script>window.onload=function(){window.print();};<\/script></body></html>`);
      w.document.close();
    }
  });

  // ---------------------------------------------------------------
  // SESIÓN Y REFRESCO AUTOMÁTICO
  // ---------------------------------------------------------------
  supabaseClient.auth.onAuthStateChange(function(evento){
    if (evento === 'SIGNED_OUT') window.location.replace('login.html');
  });

  $('avisoBtn').addEventListener('click', function(){
    if (seleccionado) seleccionar(seleccionado.id, true);
    else cargarBase();
  });

  function refrescarTodo(){
    if (!usuarioActual) return;
    cargarBase();
    if (seleccionado) seleccionar(seleccionado.id, true);
  }
  window.addEventListener('pageshow', function(e){ if (e.persisted) { renderNotificaciones(); refrescarTodo(); } });
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden && usuarioActual && leerPref(PREF_AUTO, 'on') !== 'off' && Date.now() - ultimaActualizacion > 30000) refrescarTodo();
  });
  window.addEventListener('online', refrescarTodo);

  // Permite abrir directamente un producto con trazabilidad.html?producto=ID
  function abrirDesdeUrl(){
    if (urlAbierta || !baseLista || !productos.length) return;
    urlAbierta = true;
    const id = new URLSearchParams(window.location.search).get('producto');
    if (id && productos.some(p => String(p.id) === id)) seleccionar(id);
  }

  // ---------------------------------------------------------------
  // INICIO
  // ---------------------------------------------------------------
  async function iniciar(){
    pintarTimeline(null);
    pintarTabla();
    pintarContadores(null);

    let session = null;
    try {
      const res = await supabaseClient.auth.getSession();
      session = res.data.session;
    } catch (err) {
      console.error('No se pudo leer la sesión:', err);
    }

    if (!session) { window.location.replace('login.html'); return; }

    usuarioActual = session.user;
    aplicarPrefs();
    pintarUsuario();

    // 1) Se usa al instante lo último guardado: el buscador ya funciona
    const cache = leerJSON(claveBase(), null);
    if (cache && Array.isArray(cache.productos)) {
      productos = cache.productos;
      recepcionesNotif = Array.isArray(cache.recepciones) ? cache.recepciones : [];
      construirIndice();
      baseLista = true;
      pintarRecientes();
      renderNotificaciones();
      abrirDesdeUrl();
    }

    // 2) Se piden los datos frescos en segundo plano
    await cargarBase();
  }

  iniciar();

})();
