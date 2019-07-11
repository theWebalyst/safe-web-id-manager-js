import { createActions } from 'redux-actions';
import { message } from 'antd';
import { WebIdProfile } from 'safenetworkjs'
import { WHM_CONSTANTS } from '../constants';

const { parse: parseUrl } = require('url');

export const TYPES = {
    ADD_WEB_ID            : 'ADD_WEB_ID',
    UPDATE_WEB_ID         : 'UPDATE_WEB_ID',
    GET_AVAILABLE_WEB_IDS : 'GET_AVAILABLE_WEB_IDS'
};

const TYPE_TAG = 16048;

const sanitizeWebId = ( webId ) =>
{
    const newWebId = {};

    // sanitize for webid rdf for now.
    Object.keys( webId ).forEach( key =>
    {
        if ( webId[key] && typeof webId[key] !== 'undefined' )
        {
            newWebId[key] = webId[key];
            if ( typeof newWebId[key] === 'string' )
            {
                newWebId[key] = webId[key].trim();
            }

            if ( key === 'uri' || key === 'website' )
            {
                newWebId[key] = `safe://${newWebId[key]}`;
            }
        }
    } );
    console.log( 'post sanitizing', newWebId );

    return newWebId;
};

export const {
    addWebId,
    updateWebId,
    getAvailableWebIds
} = createActions( {

    [TYPES.ADD_WEB_ID] : async ( payload ) =>
    {
        const { idApp, history, webId } = payload;

        if ( !idApp )
        {
            message.error( 'Not authorised.' );
            console.log( 'Not authorise' );
            throw new Error( 'No idApp provided to action' );
        }

        const newWebId = sanitizeWebId( webId );

        if ( window.name ) return newWebId; // jest short circuit

        try
        {
            if (newWebId.image && newWebId.imageMimeType) {
              // let's store the image first
              const imdWriter = await idApp.immutableData.create();
              await imdWriter.write(newWebId.image);
              const cipherOpt = await idApp.cipherOpt.newPlainText();
              const { xorUrl } = await imdWriter.close(cipherOpt, true, newWebId.imageMimeType);
              newWebId.image = xorUrl;
            }

            const storageUri = await createStorageForWebId(idApp, webId, 'www', 'files')
            if (storageUri) newWebId.storage = storageUri

            const md = await idApp.mutableData.newRandomPublic( TYPE_TAG );
            await md.quickSetup( {} );
            const webIdRDF = await md.emulateAs( 'WebID' );
            await webIdRDF.create( newWebId, newWebId.nick );

            // Go direct to RDF in order to set storage because
            // this is not supported in SAFE WebID API
            const webIdDirect = new WebIdProfile(idApp, newWebId.uri)
            await webIdDirect.read()
            webIdDirect.setStorageLocation(newWebId.storage)
            await webIdDirect.write()
        }
        catch ( e )
        {
            if ( e && e.message === 'No ID has been found in the RDF graph.' )
            {
                message.error( 'This publicName already exists (created by another app). You can\'t make a webId here, sorry! ' );
                return {};
            }

            console.error( 'Error in addWebId', e );
            message.error( 'Error creating webId on the network' );
            return {};
        }
        message.success( 'WebId created succesfully' );

        console.log( 'WebId created on the network.' );
        history.push( '/' ); // back to main page

        const webIdForApp = {
            ...newWebId,
            uri     : newWebId.uri.replace( 'safe://', '' ),
            website : newWebId.website ? newWebId.website.replace( 'safe://', '' ) : '',
            storage : newWebId.storage ? newWebId.storage.replace( 'safe://', '' ) : ''
        };

        return webIdForApp;
    },
    [TYPES.UPDATE_WEB_ID] : async ( payload ) =>
    {
        const { idApp, webId, history } = payload;

        if ( !idApp ) throw new Error( 'No idApp provided to update action' );

        const newWebId = sanitizeWebId( webId );

        if ( window.name ) return newWebId; // jest short circuit

        try
        {
            if (newWebId.image && newWebId.imageMimeType) {
              // let's store the image first
              const imdWriter = await idApp.immutableData.create();
              await imdWriter.write(newWebId.image);
              const cipherOpt = await idApp.cipherOpt.newPlainText();
              const { xorUrl } = await imdWriter.close(cipherOpt, true, newWebId.imageMimeType);
              newWebId.image = xorUrl;
            }

            const mdUri = newWebId.uri;

            const { content, resourceType } = await idApp.fetch( mdUri );

            let pulledWebId;
            if ( resourceType === 'RDF' )
            {
                pulledWebId = await content.emulateAs( 'WebID' );
                await pulledWebId.fetchContent();
                await pulledWebId.update( newWebId );
            }
        }
        catch ( e )
        {
            console.error( 'Error in updateWebId', e );
            message.error( 'Error updating webID on the network' );
            return e;
        }

        console.log( 'WebId updated on the network.', history );
        message.success( 'WebId updated successfully' );

        // why is this undefined? poush to newnickname....
        history.push( '/' ); // back to main page
        return newWebId;
    },
    [TYPES.GET_AVAILABLE_WEB_IDS] : async ( payload ) =>
    {
        console.log( 'Getting available ids' );
        const { idApp } = payload;

        if ( window.name ) return []; // jest short circuit

        if ( ! safeExperimentsEnabled )
        {
          message.error('The experimental APIs are disabled, please enable them from the SAFE Browser');
        }

        const webIds = await idApp.web.getWebIds();

        const actualIds = await Promise.all(webIds.map( async webId =>
        {
            const me = webId['#me'];

            // remove what is appended later
            me.uri = webId['@id'].replace( 'safe://', '' );
            if ( me.website )
            {
                const website = me.website['@id'] ? me.website['@id'] : me.website;
                me.website = website.replace('safe://', '');
            }

            if ( me.image && me.image['@id'] )
            {
                me.image = me.image['@id'];
            }

            if ( me.inbox && me.inbox['@id'] )
            {
                me.inbox = me.inbox['@id'];
            }

            if ( me.storage )
            {
                const storage = me.storage['@id'] ? me.storage['@id'] : me.storage;
                me.storage = storage.replace('safe://', '');
            }

            return me;
        } ));
        return actualIds;
    }
} );


/** The code below improves compatibility with Solid apps by adding
    storage for each new WebID and publicising this in the WebID profile.
**/

// const SN_TAGTYPE_SERVICES = 15001
// const SN_TAGTYPE_WWW = 15002  // Must be used for all MD referenced by _public,

/**
 * Create a public name with NFS storage for Solid apps.
 *
 * An app can access this storage using the SafenetworkJS LDP service.
 *
 * Inserts an entry'_public/<prefix>-<publicName>/root-ldp' into _public which
 * points to a new NFS container. Here <publicName> is the host part of the
 * webId. To publicise this storage for use by Solid apps, the caller
 * should insert the returned URI into the WebID profile document using
 * 'space:storage' in accordance with the Solid WebID profile specification.
 *
 * TODO: *Later, the storage and WebID will be able to share the same public
 * name. Until then, a new public name is created based on that of host from
 * webId.uri, but prefixing it with pubNamePrefix followed by '-'. So for a
 * webId of safe://me.happybeing/#me and subName 'files', storage will be
 * created and published as www at safe://ldp.files-happybeing
 *
 * @param  {SAFEApp}  idApp
 * @param  {WebID}    webId   SAFE WebID (currently ignored*)
 * @param  {String}   subName subName for storage
 * @param  {String}   pubNamePrefix [optional] subName for storage (default: 'files')
 * @return {Promise}          URI of the storage root or undefined on failure
 */
  const createStorageForWebId = async (idApp, webId, subName, pubNamePrefix) => {
  return new Promise( async ( resolve, reject ) => {
    try {
      if (!pubNamePrefix || pubNamePrefix.length === 0) pubNamePrefix = 'files'

      const webIdName = webId.uri
      let parsedUrl = parseUrl(webId.uri)
      if (!parsedUrl.protocol) parsedUrl = parseUrl('safe://' + webId.uri)
      const hostParts = parsedUrl.hostname.split('.')
      const webIdHost = hostParts.pop()        // last one is 'publicName'
      const webIdService = hostParts.join('.') // all others are 'subNames'

      const storageName = pubNamePrefix + '-' + webIdHost
      await createPublicName(idApp, storageName)
      console.log('created public name: ' + storageName)
      const servicePath = WHM_CONSTANTS.ACCESS_CONTAINERS.PUBLIC + '/' + storageName + '/root-ldp'
      const serviceXorName = await createServiceFolder(idApp, servicePath, storageName)

      // www service on <subName>.<storageName>
      await createService(idApp, subName, storageName, 'www', serviceXorName)

// TODO instead of creating LDP services, for now SafenetworkJS will provide LDP
// whenever a SafenetorkJS fetch is being used, LDP on a www service. This is
// a temporary solution so the container is accessible by LDP when using SafenetworkJS
// and by www when not using it (so the SAFE Browser can serve a website)
      // ldp service also on <subName>.<storageName> but giving its container
      // as '', causes SafenetworkJS LDP service to use that for www (above)
      // await createService(idApp, subName, storageName, 'ldp')
      resolve('safe://' + subName + '.' + storageName)
    } catch (e) {
      const msg = 'ERROR createStorageForWebId(' + webId.uri + ') failed'
      console.log(msg)
      console.log(e)
      reject(new Error('Failed to create storage for webId'));
    }
  })
}

// The following adapted from safe-web-hosting-manager-electron
// app/safenet_comm/api.js
//
// Github https://github.com/maidsafe/safe-web-hosting-manager-electron

/**
 * Create new Public Name
 * - Create new Public Mutable Data with sha3hash of publicName as its XORName
 * - Create new entry with publicName as key and XORName as its value
 * - Insert this entry within the _publicNames container
 * @param {string} publicName the public name
 */
const createPublicName = async (app, publicName) => {
  console.log('createPublicName(' + publicName + ')')
  return new Promise(async (resolve, reject) => {
    try {
      if (!publicName) {
        return reject(new Error( WHM_CONSTANTS.APP_ERR_CODE.INVALID_PUBLIC_NAME + ': Invalid publicName'));
      }
      const name = publicName.trim();
      const metaName = `Services container for: ${name}`;
      const metaDesc = `Container where all the services are mapped for the Public Name: ${name}`;
      const hashedName = await sha3Hash(app, name);

      const servCntr = await getServicesContainer(app, hashedName);
      await servCntr.quickSetup({}, metaName, metaDesc);
      const pubNamesCntr = await getPublicNamesContainer(app);
      await _insertToMData(pubNamesCntr, name, hashedName, true);
      resolve(true);
    } catch (err) {
      console.log('createPublicName(' + publicName + ') failed: ' + err)
      reject(err);
    }
  });
}

/**
 * Create new service
 * - Insert an entry into the service container with
 * key as sericeName and value as pathXORName
 * - If serviceName was created and deleted before,
 * it leaves the entry with empty buffer as its value.
 * Update the entry with the pathXORName as its value.
 * @param {string} subName part of web address before '.'
 * @param {string} publicName the part after '.'
 * @param {string} serviceName the service name (e.g. 'www', 'ldp' etc)
 * @param {Buffer} pathXORName [optional] XORName of service Mutable Data
 */
const createService = async (app, subName, publicName, serviceName, pathXORName) => {
  console.log('createService(app, ' + subName + ', ' + publicName + ', ' + serviceName + ', ' + pathXORName + ')')
  return new Promise(async (resolve, reject) => {
    if (!subName) {
      return reject(Error(WHM_CONSTANTS.APP_ERR_CODE.INVALID_SERVICE_NAME + ': Invalid subName'));
    }
    if (!publicName) {
      return reject(Error(WHM_CONSTANTS.APP_ERR_CODE.INVALID_PUBLIC_NAME + ': Invalid publicName'));
    }
    if (!serviceName) {
      return reject(Error(WHM_CONSTANTS.APP_ERR_CODE.INVALID_SERVICE_NAME + ': Invalid serviceName'));
    }
    if (!pathXORName) pathXORName = ''

    let servCntr;
    try {
      const serviceKey = (serviceName === 'www' ? subName : subName + '@' + serviceName)
      const pubNamesCntr = await getPublicNamesContainer(app);
      const servCntrName = await getMDataValueForKey(pubNamesCntr, publicName);
      servCntr = await getServicesContainer(app, servCntrName);
      await _insertToMData(servCntr, serviceKey, pathXORName);
      resolve(true);
    } catch (err) {
      if (err.code !== WHM_CONSTANTS.ERROR_CODE.ENTRY_EXISTS) {
        return reject(err);
      }
      try {
        await _updateMDataKey(servCntr, serviceName, pathXORName, true);
      } catch (e) {
        return reject(e);
      }
      resolve(true);
    }
  });
}

/**
 * Create service folder within _public container
 * - Create random public mutable data and insert it under _public container
 * - This entry will have the servicePath as its key
 * - This Mutable Data will hold the list file stored under it and
 * the files full paths will be stored as the key to maintain a plain structure.
 * @param {string} servicePath - service path on network
 * @param {string} metaFor - will be of `serviceName.publicName` format
 */
const createServiceFolder = async (app, servicePath, metaFor) => {
  console.log('createServiceFolder(app, ' + servicePath + ', ' + metaFor + ')')
  return new Promise(async (resolve, reject) => {
    try {
      if (!servicePath) {
        return reject(Error(WHM_CONSTANTS.APP_ERR_CODE.INVALID_SERVICE_PATH + ': Invalid service path'));
      }
      if (!metaFor) {
        return reject(Error(WHM_CONSTANTS.APP_ERR_CODE.INVALID_SERVICE_META + ': Invalid service metadata'));
      }
      const metaName = `Service Root Directory for: ${metaFor}`;
      const metaDesc = `Has the files hosted for the service: ${metaFor}`;

      const servFolder = await app.mutableData.newRandomPublic(WHM_CONSTANTS.TYPE_TAG.WWW);
      await servFolder.quickSetup({}, metaName, metaDesc);
      const servFolderInfo = await servFolder.getNameAndTag();
      const pubCntr = await getPublicContainer(app);
      await _insertToMData(pubCntr, servicePath, servFolderInfo.name);
      resolve(servFolderInfo.name);
    } catch (err) {
      reject(err);
    }
  });
}

const  getPublicContainer = async (app) => {
    if (!app) {
      return Promise.reject(new Error('Application is not connected.'));
    }
    return app.auth.getContainer(WHM_CONSTANTS.ACCESS_CONTAINERS.PUBLIC);
  }

const getPublicNamesContainer = async (app) => {
  if (!app) {
    return Promise.reject(new Error('Application is not connected.'));
  }
  return app.auth.getContainer(WHM_CONSTANTS.ACCESS_CONTAINERS.PUBLIC_NAMES);
}

const getServicesContainer = async (app, pubXORName) => {
  return app.mutableData.newPublic(pubXORName, WHM_CONSTANTS.TYPE_TAG.DNS);
}

const sha3Hash = async (app, name) => {
  return app.crypto.sha3Hash(name);
}

/* eslint-disable class-methods-use-this */
const _insertToMData = async (md, key, val, toEncrypt) => {
  console.log('_insertToMData(' + md + ', ' + key + ', ' + val + ', ' + toEncrypt + ')')
  /* eslint-enable class-methods-use-this */
  let keyToInsert = key;
  let valToInsert = val;

  return new Promise(async (resolve, reject) => {
    try {
      const entries = await md.getEntries();
      const mut = await entries.mutate();
      if (toEncrypt) {
        keyToInsert = await md.encryptKey(key);
        valToInsert = await md.encryptValue(val);
      }
      await mut.insert(keyToInsert, valToInsert);
      await md.applyEntriesMutation(mut);
      resolve(true);
    } catch (err) {
      console.log('_insertToMData() failed: ' + err )
      reject(err);
    }
  });
}

/* eslint-disable class-methods-use-this */
const getMDataValueForKey = async (md, key) => {
  /* eslint-enable class-methods-use-this */
  return new Promise(async (resolve, reject) => {
    try {
      const encKey = await md.encryptKey(key);
      const value = await md.get(encKey);

	if( value.buf.length === 0 )
	{
		resolve('');
	}

      const result = await md.decrypt(value.buf);
      resolve(result);
    } catch (err) {
      reject(err);
    }
  });
}

/* eslint-disable class-methods-use-this */
const _updateMDataKey = async (md, key, value, ifEmpty) => {
  /* eslint-enable class-methods-use-this */
  return new Promise(async (resolve, reject) => {
    try {
      const entries = await md.getEntries();
      const val = await entries.get(key);
      if (ifEmpty && val.buf.length !== 0) {
        return reject(Error(WHM_CONSTANTS.APP_ERR_CODE.ENTRY_VALUE_NOT_EMPTY + ': Entry value is not empty'));
      }
      const mut = await entries.mutate();
      await mut.update(key, value, val.version + 1);
      await md.applyEntriesMutation(mut);
      resolve(true);
    } catch (err) {
      reject(err);
    }
  });
}
