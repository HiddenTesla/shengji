package shengji.logger;

import org.apache.log4j.Logger;

public class LogFactory {
    public static Logger getLog(Class cls) {
        return Logger.getLogger(cls);
    }

    public static Logger log = Logger.getLogger(LogFactory.class);
}
