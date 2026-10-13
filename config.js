// Study configuration. Edit before deploying.
window.VISAGE_CONFIG = {
  // Google Apps Script web app URL (backend/Code.gs). Empty = dev mode: data stays in this browser and can be downloaded at the end.
  endpoint: 'https://script.google.com/macros/s/AKfycbx6MzaQTD-LokhVqvi_wvBl1_TFduqfUJ0eEfHfV4u8_GvZ2XLsqhhje5GoiKIauFe-/exec',
  // Panel return. {pid} and {code} are replaced. Empty = show the completion code on screen.
  completionUrl: '',
  completionCode: 'VSG26P',
  study: 'pilot',            // 'pilot' (10-axis calibration) | 'main' (6 axes, set mainAxes)
  mainAxes: ['smile', 'hair', 'grooming', 'attire', 'lighting', 'background'],
  attentionAnswer: 3,
  ageRange: [20, 39],         // eligibility; outside -> screen-out page
  screenoutUrl: ''           // panel screen-out return ({pid} replaced); empty = message only
};
