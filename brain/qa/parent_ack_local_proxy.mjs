// Local loopback proxy only. The remote QA Worker alone holds a narrowly
// scoped cross-script binding; this proxy never deploys.
export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.pathname!=="/__canonical_ack_one"||url.search||request.method!=="POST")
       return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
    return env.REMOTE_ACK_QA.fetch(request);
  }
};
