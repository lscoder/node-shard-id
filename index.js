// https://github.com/candu/node-int64-native
var Int64Native = require('int64-native');
var idGenEpochTime = Date.UTC(2014, 0, 1, 0, 0, 0, 0); // Jan, 1, 2014
var powerTwo = [];

// Cache of 2^(1 to 32) for performance improvement
for(var i = 0; i < 32; i++) {
  powerTwo.push(Math.pow(2, i));
}

function getGeneratorId(generatorId) {
  if((typeof(generatorId) === 'number') && (generatorId < 0)) {
    throw new Error('Invalid generator id (negative)');
  }

  return generatorId == null ? undefined : generatorId;
}

function getShardCount(shardCount, maxShardCount) {
  if(shardCount === undefined) {
    return 1;
  }

  if((typeof(shardCount) !== 'number') || (shardCount <= 0) || (shardCount > maxShardCount)) {
    throw new Error('Invalid shardCount [' + shardCount + ']! It must be a value between 1 and ' + maxShardCount);
  }

  return shardCount;
}

function getCurrentEpoch() {
  var currentDate = new Date();
  return currentDate.getTime() - (currentDate.getTimezoneOffset() * 60000);
}

function convertToUInt(number) {
  var value = number & 0x7FFFFFFF;
  if((number & 0xFFFFFFFF) < 0) {
    value += Math.pow(2, 31);
  }

  return value;
}

module.exports = function(params) {
  params = params || {};

  var generatorId = getGeneratorId(params.generatorId);
  var useGeneratorId = (typeof(generatorId) === 'number');
  var maxShardCount = useGeneratorId ? powerTwo[10] : powerTwo[13];
  var shardCount = getShardCount(params.shardCount, maxShardCount);
  var shardIdMask = maxShardCount - 1; // 0x3FF (10 bits) or 0x1FFF (13 bits)
  var maxAutoIncValue = powerTwo[10];

  var currentShardId = 0;
  var autoIncrement = 0;
  var lastEpochTime;

  return function() {
    var currentEpochTime = getCurrentEpoch();
    var elapsedEpochTime = currentEpochTime - idGenEpochTime;

    // Building the Id from MSB to LSB (left to right)
    //   - To shift to the left we need to multiply by powerTwo[Bits]
    //   - To shift to the right we need to divide by powerTwo[Bits]

    // Epoch Time - 41 bits
    // 69 years, 8 meses and 26 days approx (starting on the idGenEpochTime)
    //   - 32 bits as the HI INT32 (Position: 32-63)
    //   -  9 bits in the LO INT32 (Position: 23-31)
    var hi = convertToUInt(elapsedEpochTime / powerTwo[9]);
    var lo = (elapsedEpochTime & 0x1FF) * powerTwo[23];

    // Reset the auto-incrementing value
    if(lastEpochTime !== currentEpochTime) {
      autoIncrement = 0;
      lastEpochTime = currentEpochTime;
    }

    // Auto-incrementing sequence = 10 bits (Position: 13-22)
    //   - 2^10 (1024) unique ids per generator and/or shard per millisecond
    lo += autoIncrement * powerTwo[13];
    autoIncrement = (autoIncrement + 1) % maxAutoIncValue;

    // Generator ID - 3 bits (Position: 10-12)
    if(useGeneratorId) {
      lo += (generatorId & 0x7) * powerTwo[10];
    }

    // Logical Shard Id
    //   - 10 bits for useGeneratorId equals to TRUE (Position: 0-9)
    //   - 13 bits for useGeneratorId equals to FALSE (Position: 0-12)
    lo += (currentShardId & shardIdMask);
    currentShardId = (currentShardId + 1) % shardCount;

    // Convert to string using 3rd part library
    var int64 = new Int64Native(hi, lo);
    return int64.toUnsignedDecimalString();
  }
}
