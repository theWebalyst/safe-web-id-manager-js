import { createActions } from 'redux-actions';
// import {message} from 'antd';
import { SAFE_CONSTANTS } from '../constants';

export const TYPES = {
    ADD_WEB_ID            : 'ADD_WEB_ID',
    UPDATE_WEB_ID         : 'UPDATE_WEB_ID',
    GET_AVAILABLE_WEB_IDS : 'GET_AVAILABLE_WEB_IDS',
    GET_WEB_ID            : 'GET_WEB_ID'
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
        }
    } );
    console.log('post sanitizing', webId)

    return newWebId;
};


export const {
    addWebId,
    updateWebId,
    // getWebId,
    getAvailableWebIds
} = createActions( {

    [TYPES.ADD_WEB_ID] : async ( payload ) =>
    {

        const { idApp, history, webId } = payload;

        if( !idApp ) throw new Error( 'No idApp provided to action' );

        const newWebId = sanitizeWebId( webId );

        if ( window.name ) return newWebId; // jest short circuit

        try
        {
            const md = await idApp.mutableData.newRandomPublic( TYPE_TAG );
            await md.quickSetup( {} );
            const webIdRDF = await md.emulateAs( 'WebID' );
            await webIdRDF.create( newWebId, newWebId.nick );
        }
        catch ( e )
        {
            console.log( 'Error in addWebId', e );
            return;
        }

        console.log( 'WebId created on the network.' );
        history.push( '/' ); // back to main page
        return newWebId;
    },
    [TYPES.UPDATE_WEB_ID] : async ( payload ) =>
    {
        const { idApp, webId } = payload;

        if( !idApp ) throw new Error( 'No idApp provided to update action' );

        const newWebId = sanitizeWebId( webId );

        if ( window.name ) return newWebId; // jest short circuit

        try
        {
            const mdUri =  newWebId["@id"] ;

            const { serviceMd, type, path } = await idApp.fetch( mdUri );

            let pulledWebId;
            if (type === 'RDF') {
                pulledWebId = await serviceMd.emulateAs('RDF');
                await pulledWebId.nowOrWhenFetched();
                pulledWebId = await serviceMd.emulateAs('webId');
            }

            await pulledWebId.update(newWebId);

        }
        catch ( e )
        {
            console.log( 'Error in updateWebId', e );
            return e;
        }

        console.log( 'WebId updated on the network.' );
        // history.push( '/' ); // back to main page
        return newWebId;
    },
    [TYPES.GET_AVAILABLE_WEB_IDS] : async ( payload ) =>
    {
        console.log( 'Getting available ids' );
        const { idApp } = payload;

        if ( window.name ) return []; // jest short circuit

        const webIds = await idApp.web.getWebIds( );

        return webIds;
    }
} );
