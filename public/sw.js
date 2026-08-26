self.addEventListener('push', function(event){
  const data = event.data.json();
  self.registration.showNotification('VobixChat - Te llaman', {
    body: data.username + ' te está llamando',
    icon: '/icon.png',
    vibrate: [500,200,500],
    sound: '/ring.mp3'
  });
});