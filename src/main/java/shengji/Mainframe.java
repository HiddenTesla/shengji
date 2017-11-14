package shengji;

import shengji.logger.LogFactory;
import org.apache.log4j.Logger;
import org.testng.annotations.Test;

import javax.swing.*;


/**
 *
 */

public class Mainframe {

    // region member variables
    private static Logger log = LogFactory.getLog(Mainframe.class);

    // endregion
    public static void main(String[] args) {

        JFrame frame = new JFrame();

        // Size may be adjusted at any time
        frame.setSize(600, 300);

        // Centralize the frame
        frame.setLocationRelativeTo(null);


        frame.setVisible(true);

        log.info("Main frame started");
    }

    @Test
    public void LogSomething() throws Exception {
        log.debug("Debug");
        log.info("Info");
        log.warn("Warning");
        log.error("Error");
        log.fatal("Fatal");
    }


    @Test
    public void NewFrame() throws Exception {
        JFrame frame = new JFrame("Shengji");

        frame.setVisible(true);
    }
}
