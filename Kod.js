function doPost(e) { 
  Logger.log('POST');
  const postData = JSON.parse(e.postData.contents);
  if (postData.action !== undefined) {
    switch (postData.action) {
      case 'getUserCode': {
        if (postData.clientId === undefined || postData.clientSecret === undefined || postData.scopes === undefined || postData.scopes.length === 0) {
          return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: 'Brak wymaganych parametrów (1).' })).setMimeType(ContentService.MimeType.JSON);
        }
        const options = {
          method: 'post',
          headers: {
            'Authorization': `Basic ${Utilities.base64Encode(postData.clientId + ':' + postData.clientSecret)}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          payload: {
            'client_id': postData.clientId,
            'scope': postData.scopes.join(' ')
          },
          muteHttpExceptions: true
        } 

        Logger.log(options);

        const responseJSON = UrlFetchApp.fetch('https://allegro.pl.allegrosandbox.pl/auth/oauth/device', options);
        const code = responseJSON.getResponseCode();
        if (code == 200) {
          const response = JSON.parse(responseJSON);  
          const expirationDate = Date.now() + (5 * 60 * 1000); 
          return ContentService.createTextOutput(JSON.stringify({ status: 'success', deviceCode: response.device_code, verificationUri: response.verification_uri_complete, expirationDate: expirationDate, interval: response.interval })).setMimeType(ContentService.MimeType.JSON);
        } else {
          Logger.log('user_code error');
          Logger.log(responseJSON);
          return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: `Błąd podczas pobierania user_code i device_code, kod odpowiedzi HTTP: ${code}.` })).setMimeType(ContentService.MimeType.JSON); 
        }
      }
      case 'getTokens': {
        if (postData.clientId === undefined || postData.clientSecret === undefined || postData.deviceCode === undefined || postData.expirationDate === undefined) {
          return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: 'Brak wymaganych parametrów (2).' })).setMimeType(ContentService.MimeType.JSON);
        }

        const poolingInterval = ((postData?.interval ?? 10) * 1000);
        const options = {
          method: 'post',
          headers: {
            'Authorization': `Basic ${Utilities.base64Encode(postData.clientId + ':' + postData.clientSecret)}`
          },
          payload: {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': postData.deviceCode
          },
          muteHttpExceptions: true
        }
        let currentTime;
        const authorizationUrl = 'https://allegro.pl.allegrosandbox.pl/auth/oauth/token';
        do {
          currentTime = Date.now();
          if (currentTime >= postData.expirationDate) {
            return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: 'Upłynął czas na zatwierdzenie logowania.' })).setMimeType(ContentService.MimeType.JSON);
          }
          
          const responseJSON = UrlFetchApp.fetch(authorizationUrl, options);
          const code = responseJSON.getResponseCode();      
          let response = JSON.parse(responseJSON);
          if (code == 200) {
            return ContentService.createTextOutput(JSON.stringify({ status: 'success', accessToken: response.access_token, refreshToken: response.refresh_token })).setMimeType(ContentService.MimeType.JSON); 
          } else if (code == 400) {
            if (response.error === 'access_denied') {
              return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: 'Użytkownik odmówił autoryzacji.' })).setMimeType(ContentService.MimeType.JSON);
            } else if (response.error === 'Invalid device code') {
              return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: 'Błędny device_code.' })).setMimeType(ContentService.MimeType.JSON);
            } else if (response.error === 'slow_down') {
              poolingInterval += 1000;
            }
          }
          Logger.log('user accepted?');
          Utilities.sleep(poolingInterval);
        } while (currentTime < postData.expirationDate);
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: 'Upłynął czas na zatwierdzenie logowania.' })).setMimeType(ContentService.MimeType.JSON);
        break;
      }
      case 'refreshTokens': {
        if (postData.refreshToken === undefined || postData.clientId === undefined || postData.clientSecret === undefined) {
          return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: 'Brak wymaganych parametrów (3).' })).setMimeType(ContentService.MimeType.JSON);
        }
        Logger.log('refreshing token...');
        const options = {
          method: 'post',
          headers: {
            'Authorization': `Basic ${Utilities.base64Encode(postData.clientId + ':' + postData.clientSecret)}`,
          },
          payload: {
            'grant_type': 'refresh_token',
            'refresh_token': postData.refreshToken
          },
          muteHttpExceptions: true
        } 

        const responseJSON = UrlFetchApp.fetch('https://allegro.pl.allegrosandbox.pl/auth/oauth/token', options);
        const code = responseJSON.getResponseCode();
        Logger.log(`refresh token status code: ${code}`);
        if (code == 200) {
          const response = JSON.parse(responseJSON);  
          return ContentService.createTextOutput(JSON.stringify({ status: 'success', accessToken: response.access_token, refreshToken: response.refresh_token })).setMimeType(ContentService.MimeType.JSON); 
        } else {
          return ContentService.createTextOutput(JSON.stringify({ status: 'error', details: 'Błąd podczas odświeżania tokena.' })).setMimeType(ContentService.MimeType.JSON);
        }
        break;
      }
    }
  }
}