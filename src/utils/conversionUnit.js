// utils/unitConverter.js
const conversions = {
    weight: {
      kg: 1000,
      g: 1
    },
    volume: {
      l: 1000,
      ml: 1
    },
    count: {
      pcs: 1
    }
  };
  
  export const convertToBase = (quantity, unit, unitType) => {
    return quantity * conversions[unitType][unit];
  };
  
  export const convertFromBase = (quantity, unit, unitType) => {
    return quantity / conversions[unitType][unit];
  };