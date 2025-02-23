/* @flow */

import he from 'he';
import axios from 'axios';
import { find } from 'lodash';
import striptags from 'striptags';

export async function getSubtitles({
  videoID,
  lang = 'en',
}: {
  videoID: string,
  lang: string | string[] | void,
}) {
  let theLang = lang
  const { data } = await axios.get(
    `https://youtube.com/watch?v=${videoID}`
  );

  // * ensure we have access to captions data
  if (!data.includes('captionTracks'))
    throw new Error(`Could not find captions for video: ${videoID}`);

  const regex = /({"captionTracks":.*isTranslatable":(true|false)}])/;
  const [match] = regex.exec(data);
  const { captionTracks } = JSON.parse(`${match}}`);
  
  if (Array.isArray(theLang)) {
    let chosenLang = null
    theLang.forEach(l => {
      if (
        captionTracks.find(({ languageCode }) => languageCode.slice(0, 2) === l)
      ) {
        chosenLang = l
      }
    })
    if (!chosenLang) {
      throw new Error(`Could not find ${theLang} captions for ${videoID}`);
    } else {
      theLang = chosenLang
    }
  }

  if (!theLang) {
    theLang = captionTracks[0].languageCode
  }

  const subtitle =
    find(captionTracks, {
      vssId: `.${theLang}`,
    }) ||
    find(captionTracks, {
      vssId: `a.${theLang}`,
    }) ||
    find(captionTracks, ({ vssId }) => vssId && vssId.match(`.${theLang}`));

  // * ensure we have found the correct subtitle lang
  if (!subtitle || (subtitle && !subtitle.baseUrl))
    throw new Error(`Could not find ${theLang} captions for ${videoID}`);

  const { data: transcript } = await axios.get(subtitle.baseUrl);
  const lines = transcript
    .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', '')
    .replace('</transcript>', '')
    .split('</text>')
    .filter(line => line && line.trim())
    .map(line => {
      const startRegex = /start="([\d.]+)"/;
      const durRegex = /dur="([\d.]+)"/;

      const [, start] = startRegex.exec(line);
      const [, dur] = durRegex.exec(line);

      const htmlText = line
        .replace(/<text.+>/, '')
        .replace(/&amp;/gi, '&')
        .replace(/<\/?[^>]+(>|$)/g, '');

      const decodedText = he.decode(htmlText);
      const text = striptags(decodedText);

      return {
        start,
        dur,
        text,
        lang: theLang
      };
    });

  return lines;
}
