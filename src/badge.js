const { ipcRenderer } = require('electron');

function drawBadge(count) {
  if (count === 0) {
    ipcRenderer.send('update-badge', null);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.height = 140;
  canvas.width = 140;
  const ctx = canvas.getContext('2d');

  // Draw red circle
  ctx.fillStyle = '#FF0000';
  ctx.beginPath();
  ctx.ellipse(70, 70, 70, 70, 0, 0, 2 * Math.PI);
  ctx.fill();

  // Draw text
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  
  let text = String(count);
  if (count > 99) {
    text = '99+';
    ctx.font = 'bold 75px sans-serif';
    ctx.fillText(text, 70, 98);
  } else if (count > 9) {
    ctx.font = 'bold 80px sans-serif';
    ctx.fillText(text, 70, 105);
  } else {
    ctx.font = 'bold 100px sans-serif';
    ctx.fillText(text, 70, 112);
  }

  ipcRenderer.send('update-badge', canvas.toDataURL());
}

module.exports = { drawBadge };